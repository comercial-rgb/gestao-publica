import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { cadastrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import { anularAbastecimento, cadastrarMaquina, cadastrarVeiculo, registrarAbastecimento } from "./servico.js";
import {
  abrirManutencaoDaFrota,
  autorizarManutencaoDaFrota,
  cadastrarCondutor,
  cancelarManutencaoDaFrota,
  cancelarOrdemDeAbastecimento,
  concluirManutencaoDaFrota,
  consumoDoBemDaFrota,
  declararExigenciaDeHabilitacao,
  emitirOrdemDeAbastecimento,
  publicarVersaoDoCondutor,
  registrarLeituraDoMarcador,
} from "./operacao.js";

/**
 * V39-R2 (R2-025 a R2-028) — A OPERAÇÃO DA FROTA.
 *
 * Fixture: o veículo ABC1234 (em uso desde 01/03/2026) e a máquina RET0001; os condutores Ana (CNH B, vence 31/12/2026) e
 * Bruno (CNH D, vence 15/03/2026). Contas feitas à mão:
 *   · ordem nº 1 de 50 L de gasolina: abastecimentos de 30 e 20 fecham; mais 1 passa (51 > 50); anulado o de 20, cabem 20;
 *   · leituras 10.000,0 (05/03, com 30 L), 10.420,0 (12/03, com 20 L): consumo do segundo = 420 / 20 = 21,00 km/L;
 *     corrigida a de 12/03 para 10.400,0: 400 / 20 = 20,00 km/L.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "patrimonio@cg.pb.gov.br";
let veiculoId = "";
let maquinaId = "";
let ana = "";
let bruno = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.entidadeContabil.create({ data: { id: "ent-pref", codigo: "0001", criadoPor: POR } });
  const ugId = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201001", nome: "Prefeitura Municipal", cnpj: "11222333000181", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref", vigenteDesde: meioDiaCivil("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
  veiculoId = (await cadastrarVeiculo(prisma, { ugId, placa: "ABC1234", anoModelo: 2022, renavam: "123456789", numeroModelo: "1234", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: "2026-03-01", situacaoInicial: "EM_USO", fundamento: "Documento do veículo (fixture)", criadoPor: POR })).id;
  maquinaId = (await cadastrarMaquina(prisma, { ugId, codigo: "RET0001", anoFabricacao: 2020, descricao: "Retroescavadeira", tipoFrota: "PROPRIO", combustivelPrincipal: "DIESEL", vigenteDesde: "2026-03-01", situacaoInicial: "EM_USO", fundamento: "Nota da máquina (fixture)", criadoPor: POR })).id;
  ana = (await cadastrarCondutor(prisma, { nome: "Ana Condutora", matricula: "1001", cnhNumero: "12345678901", cnhCategoria: "B", cnhValidade: "2026-12-31", vinculo: "Servidora efetiva", vigenteDesde: "2026-01-01", fundamento: "CNH apresentada (fixture)", criadoPor: POR })).id;
  bruno = (await cadastrarCondutor(prisma, { nome: "Bruno Condutor", matricula: "1002", cnhNumero: "10987654321", cnhCategoria: "D", cnhValidade: "2026-03-15", vinculo: "Terceirizado", vigenteDesde: "2026-01-01", fundamento: "CNH apresentada (fixture)", criadoPor: POR })).id;
}, 120000);
afterAll(async () => prisma.$disconnect());

const ordem = (extra: Record<string, unknown> = {}) =>
  emitirOrdemDeAbastecimento(prisma, { veiculoId, condutorId: ana, combustivel: "GASOLINA", quantidadeAutorizada: "50", emitidaEm: "2026-03-05", validaAte: "2026-03-31", local: "Posto do contrato 10/2026", criadoPor: POR, ...extra });
const abastecer = (quantidade: string, data: string, extra: Record<string, unknown> = {}) =>
  registrarAbastecimento(prisma, { veiculoId, data, combustivel: "GASOLINA", quantidade, documento: `Cupom ${data}`, criadoPor: POR, ...extra });

describe("V39-R2 (R2-025) — condutor e habilitação", { timeout: 120000 }, () => {
  it("a ordem confere CNH vencida no prazo, condutor inativo e categoria aceita declarada pelo ente, com o motivo", async () => {
    // Bruno: CNH vence em 15/03, e a ordem vale até 31/03
    await expect(ordem({ condutorId: bruno })).rejects.toThrow(/A CNH do condutor Bruno Condutor vence em 15\/03\/2026, antes de 31\/03\/2026/);
    await expect(ordem({ condutorId: bruno, validaAte: "2026-03-14" })).resolves.toMatchObject({ numero: 1 });
    // o ente declara que a retroescavadeira aceita C, D ou E: Ana (B) não, Bruno (D) sim
    await declararExigenciaDeHabilitacao(prisma, { maquinaId, categoriasAceitas: ["C", "D", "E"], vigenteDesde: "2026-03-01", fundamento: "Norma interna da garagem (fixture)", criadoPor: POR });
    await expect(ordem({ veiculoId: undefined, maquinaId, combustivel: "DIESEL", validaAte: "2026-03-10" })).rejects.toThrow(/A CNH do condutor Ana Condutora é da categoria B, e a máquina RET0001 aceita C, D, E \(declarado pelo ente\)/);
    await expect(ordem({ veiculoId: undefined, maquinaId, condutorId: bruno, combustivel: "DIESEL", validaAte: "2026-03-10" })).resolves.toMatchObject({ numero: 2 });
    // Ana desligada a partir de 01/04: a ordem de abril é recusada
    await publicarVersaoDoCondutor(prisma, { condutorId: ana, ativo: false, cnhNumero: "12345678901", cnhCategoria: "B", cnhValidade: "2026-12-31", vinculo: "Servidora efetiva", vigenteDesde: "2026-04-01", fundamento: "Exoneração (fixture)", criadoPor: POR });
    await expect(ordem({ emitidaEm: "2026-04-02", validaAte: "2026-04-10" })).rejects.toThrow(/O condutor Ana Condutora não estava ativo em 02\/04\/2026/);
    expect(await prisma.ordemDeAbastecimento.count()).toBe(2);
  });
});

describe("V39-R2 (R2-026) — ordem de abastecimento conferida com o abastecido", { timeout: 120000 }, () => {
  it("N=2 abastecimentos fecham o autorizado; o que passa é recusado; anulado libera saldo; combustível, prazo e cancelamento conferidos", async () => {
    const { id: ordemId } = await ordem();
    await abastecer("30", "2026-03-05", { ordemId });
    const segundo = await abastecer("20", "2026-03-12", { ordemId });
    await expect(abastecer("1", "2026-03-13", { ordemId })).rejects.toThrow(/A ordem nº 1 autoriza 50\.00, já foram abastecidos 50\.00, e este abastecimento é de 1\.00: passa do autorizado/);
    await anularAbastecimento(prisma, { id: segundo.id, motivo: "Cupom lançado em duplicidade (fixture)", criadoPor: POR });
    await abastecer("20", "2026-03-13", { ordemId });
    await expect(abastecer("1", "2026-03-13", { ordemId, combustivel: "ETANOL" })).rejects.toThrow(/A ordem nº 1 autoriza gasolina, não etanol/);
    await expect(abastecer("1", "2026-04-01", { ordemId })).rejects.toThrow(/A ordem nº 1 vale de 05\/03\/2026 a 31\/03\/2026, e o abastecimento é de 01\/04\/2026/);
    await cancelarOrdemDeAbastecimento(prisma, { ordemId, motivo: "Veículo recolhido (fixture)", criadoPor: POR });
    await expect(abastecer("1", "2026-03-20", { ordemId })).rejects.toThrow(/A ordem nº 1 foi cancelada/);
    expect(await prisma.abastecimentoDaFrota.count({ where: { ordemId, anulacao: null } })).toBe(2);
  });

  it("A TRAVA EXISTE: com o bem travado por outra transação, o abastecimento espera e só grava depois que ela termina", async () => {
    // Prova determinística da serialização (duas chamadas simultâneas nem sempre se cruzam): segura a trava do bem e
    // confere que o abastecimento não termina enquanto ela está presa.
    const { id: ordemId } = await ordem();
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((r) => { liberar = r; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((r) => { travado = r; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "BemDaFrota", [veiculoId]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const ab = abastecer("10", "2026-03-05", { ordemId }).then(() => { terminou = true; });
    await new Promise((r) => setTimeout(r, 800));
    expect(terminou).toBe(false);
    liberar();
    await segurando;
    await ab;
    expect(terminou).toBe(true);
  });

  it("CONCORRÊNCIA: dois abastecimentos simultâneos de 30 L numa ordem de 50 — um grava, o outro é recusado pelo saldo", async () => {
    const { id: ordemId } = await ordem();
    const r = await Promise.allSettled([abastecer("30", "2026-03-05", { ordemId }), abastecer("30", "2026-03-05", { ordemId })]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/já foram abastecidos 30\.00, e este abastecimento é de 30\.00: passa do autorizado/);
    expect(await prisma.abastecimentoDaFrota.count({ where: { ordemId } })).toBe(1);
  });
});

describe("V39-R2 (R2-027) — hodômetro e horímetro, com o consumo", { timeout: 120000 }, () => {
  it("a leitura não volta; a correção aponta a errada com motivo e muda o consumo; a errada fica guardada", async () => {
    await abastecer("30", "2026-03-05", { leitura: "10.000,0" });
    await abastecer("20", "2026-03-12", { leitura: "10.420,0" });
    let c = await consumoDoBemDaFrota(prisma, { veiculoId }, true);
    expect(c.map((x) => [x.data, x.leitura, x.percorrido, x.consumo])).toEqual([["05/03/2026", "10000.0", null, null], ["12/03/2026", "10420.0", "420.0", "21.00"]]);
    await expect(registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-15", valor: "10.300,0", criadoPor: POR })).rejects.toThrow(/A leitura de 10300\.0 km é menor que a de 12\/03\/2026 \(10420\.0 km\): o hodômetro do veículo ABC1234 não volta/);
    await expect(registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-08", valor: "10.500,0", criadoPor: POR })).rejects.toThrow(/é maior que a de 12\/03\/2026 \(10420\.0 km\), posterior/);
    await expect(registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-08", valor: "10200.5", criadoPor: POR })).rejects.toThrow(/Informe a leitura com vírgula na casa decimal/);
    const errada = await prisma.leituraDoMarcadorDaFrota.findFirstOrThrow({ where: { veiculoId, valor: "10420.0" }, select: { id: true } });
    await expect(registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-12", valor: "10.400,0", corrigeId: errada.id, criadoPor: POR })).rejects.toThrow(/A correção diz por que a leitura anterior está errada/);
    await registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-12", valor: "10.400,0", corrigeId: errada.id, motivo: "Leitura digitada errada no cupom", criadoPor: POR });
    c = await consumoDoBemDaFrota(prisma, { veiculoId }, true);
    expect(c[1]).toMatchObject({ leitura: "10400.0", percorrido: "400.0", consumo: "20.00" });
    // a correção da correção: a cadeia é seguida até a última
    const primeira = await prisma.leituraDoMarcadorDaFrota.findFirstOrThrow({ where: { corrigeId: errada.id }, select: { id: true } });
    await registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-12", valor: "10.360,0", corrigeId: primeira.id, motivo: "A correção também estava errada", criadoPor: POR });
    c = await consumoDoBemDaFrota(prisma, { veiculoId }, true);
    expect(c[1]).toMatchObject({ leitura: "10360.0", percorrido: "360.0", consumo: "18.00" });
    expect(await prisma.leituraDoMarcadorDaFrota.count({ where: { veiculoId } })).toBe(4);
    // a leitura de abastecimento anulado sai da conta: depois de anular o de 12/03, uma leitura de 10.100,0 em 13/03 passa
    const doze = await prisma.abastecimentoDaFrota.findFirstOrThrow({ where: { veiculoId, quantidade: "20" }, select: { id: true } });
    await anularAbastecimento(prisma, { id: doze.id, motivo: "Lançado no veículo errado (fixture)", criadoPor: POR });
    await expect(registrarLeituraDoMarcador(prisma, { veiculoId, data: "2026-03-13", valor: "10.100,0", criadoPor: POR })).resolves.toMatchObject({ id: expect.any(String) as string });
    // o horímetro da máquina: litros por hora
    await registrarAbastecimento(prisma, { maquinaId, data: "2026-03-05", combustivel: "DIESEL", quantidade: "40", documento: "Cupom 1", leitura: "100,0", criadoPor: POR });
    await registrarAbastecimento(prisma, { maquinaId, data: "2026-03-10", combustivel: "DIESEL", quantidade: "60", documento: "Cupom 2", leitura: "112,0", criadoPor: POR });
    expect((await consumoDoBemDaFrota(prisma, { maquinaId }, false))[1]).toMatchObject({ percorrido: "12.0", consumo: "5.00" });
  });
});

describe("V39-R2 (R2-028) — manutenção do pedido à conclusão", { timeout: 120000 }, () => {
  it("pedido, autorização com contrato e valor, conclusão com custo; concluir sem autorizar, datas invertidas e cancelar concluída são recusados", async () => {
    const m = await abrirManutencaoDaFrota(prisma, { veiculoId, tipo: "CORRETIVA", descricao: "Troca da embreagem", solicitante: "Chefe da garagem", dataDoPedido: "2026-03-10", criadoPor: POR });
    await expect(concluirManutencaoDaFrota(prisma, { manutencaoId: m.id, data: "2026-03-12", custo: "1.500,00", documento: "NF 77", criadoPor: POR })).rejects.toThrow(/não foi autorizada: não se conclui serviço que ninguém autorizou/);
    await expect(autorizarManutencaoDaFrota(prisma, { manutencaoId: m.id, data: "2026-03-09", fornecedor: "Oficina Exemplo", valorEstimado: "1.600,00", criadoPor: POR })).rejects.toThrow(/A autorização não pode ser anterior ao pedido \(10\/03\/2026\)/);
    await autorizarManutencaoDaFrota(prisma, { manutencaoId: m.id, data: "2026-03-10", fornecedor: "Oficina Exemplo", valorEstimado: "1.600,00", criadoPor: POR });
    await concluirManutencaoDaFrota(prisma, { manutencaoId: m.id, data: "2026-03-12", custo: "1.500,00", documento: "NF 77", criadoPor: POR });
    await expect(cancelarManutencaoDaFrota(prisma, { manutencaoId: m.id, motivo: "Tentativa (fixture)", criadoPor: POR })).rejects.toThrow(/A manutenção nº 1 já foi concluída/);
    const m2 = await abrirManutencaoDaFrota(prisma, { maquinaId, tipo: "PREVENTIVA", descricao: "Revisão de 500 horas", solicitante: "Operador", dataDoPedido: "2026-03-11", criadoPor: POR });
    expect(m2.numero).toBe(2);
    await cancelarManutencaoDaFrota(prisma, { manutencaoId: m2.id, motivo: "Revisão feita na garantia", criadoPor: POR });
    await expect(autorizarManutencaoDaFrota(prisma, { manutencaoId: m2.id, data: "2026-03-12", fornecedor: "Oficina", valorEstimado: "100,00", criadoPor: POR })).rejects.toThrow(/A manutenção nº 2 foi cancelada/);
    const conc = await prisma.conclusaoDaManutencaoDaFrota.findMany({ select: { custo: true } });
    expect(conc.map((x) => x.custo.toFixed(2))).toEqual(["1500.00"]);
  });

  it("NEGAÇÃO: quem cadastra a frota não autoriza manutenção nem emite ordem; o motivo nomeia a ação", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "garagem@cg.pb.gov.br", nome: "garagem", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "GARAGEM", descricao: "teste", criadoPor: "TESTE", permissoes: { create: [{ acao: "CADASTRAR_FROTA", criadoPor: "TESTE" }, { acao: "REGISTRAR_ABASTECIMENTO", criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    const m = await abrirManutencaoDaFrota(prisma, { veiculoId, tipo: "CORRETIVA", descricao: "Pneu furado", solicitante: "Motorista", dataDoPedido: "2026-03-10", criadoPor: "garagem@cg.pb.gov.br" });
    await expect(autorizarManutencaoDaFrota(prisma, { manutencaoId: m.id, data: "2026-03-10", fornecedor: "Borracharia", valorEstimado: "50,00", criadoPor: "garagem@cg.pb.gov.br" })).rejects.toThrow(/não tem permissão para AUTORIZAR_MANUTENCAO_DA_FROTA/);
    await expect(ordem({ criadoPor: "garagem@cg.pb.gov.br" })).rejects.toThrow(/não tem permissão para EMITIR_ORDEM_DE_ABASTECIMENTO/);
    expect([await prisma.autorizacaoDaManutencaoDaFrota.count(), await prisma.ordemDeAbastecimento.count()]).toEqual([0, 0]);
  });
});

describe("V39-R3 (R3-013) — a ACC é categoria própria, e a validade é conferida na ordem e no abastecimento", { timeout: 120000 }, () => {
  it("ACC não vira A nem C, e A não vira ACC: o que o bem aceita é o que o ente declara; CNH vencida na ordem e condutor inativo no abastecimento são recusados", async () => {
    const carla = (await cadastrarCondutor(prisma, { nome: "Carla Ciclomotor", matricula: "1003", cnhNumero: "22233344455", cnhCategoria: "ACC", cnhValidade: "2026-03-20", vinculo: "Servidora efetiva", vigenteDesde: "2026-01-01", fundamento: "ACC apresentada (fixture)", criadoPor: POR })).id;
    const daniel = (await cadastrarCondutor(prisma, { nome: "Daniel Motociclista", matricula: "1004", cnhNumero: "33344455566", cnhCategoria: "A", cnhValidade: "2026-12-31", vinculo: "Servidor efetivo", vigenteDesde: "2026-01-01", fundamento: "CNH apresentada (fixture)", criadoPor: POR })).id;
    expect((await prisma.versaoDoCondutor.findFirstOrThrow({ where: { condutorId: carla }, select: { cnhCategoria: true } })).cnhCategoria).toBe("ACC");
    // o bem que aceita A: a ACC NÃO é A (lida letra a letra, seria)
    await declararExigenciaDeHabilitacao(prisma, { veiculoId, categoriasAceitas: ["A"], vigenteDesde: "2026-03-01", fundamento: "Motocicleta (fixture)", criadoPor: POR });
    await expect(ordem({ condutorId: carla, validaAte: "2026-03-10" })).rejects.toThrow(/A CNH do condutor Carla Ciclomotor é da categoria ACC, e o veículo ABC1234 aceita A \(declarado pelo ente\)/);
    await expect(ordem({ condutorId: daniel, validaAte: "2026-03-10" })).resolves.toMatchObject({ numero: 1 });
    // o bem que aceita ACC: o A NÃO é ACC por conta do sistema
    await declararExigenciaDeHabilitacao(prisma, { maquinaId, categoriasAceitas: ["ACC"], vigenteDesde: "2026-03-01", fundamento: "Ciclomotor (fixture)", criadoPor: POR });
    const ordemDaMaquina = (extra: Record<string, unknown>) => ordem({ veiculoId: undefined, maquinaId, combustivel: "DIESEL", ...extra });
    await expect(ordemDaMaquina({ condutorId: daniel, validaAte: "2026-03-10" })).rejects.toThrow(/é da categoria A, e a máquina RET0001 aceita ACC/);
    // a validade da ACC na ordem: vence em 20/03, a ordem até 31/03 é recusada; até 18/03 passa
    await expect(ordemDaMaquina({ condutorId: carla })).rejects.toThrow(/A CNH do condutor Carla Ciclomotor vence em 20\/03\/2026, antes de 31\/03\/2026/);
    const { id: ordemId } = await ordemDaMaquina({ condutorId: carla, validaAte: "2026-03-18" });
    // no abastecimento: a condutora desligada depois da ordem não abastece por ela
    await publicarVersaoDoCondutor(prisma, { condutorId: carla, ativo: false, cnhNumero: "22233344455", cnhCategoria: "ACC", cnhValidade: "2026-03-20", vinculo: "Servidora efetiva", vigenteDesde: "2026-03-10", fundamento: "Desligamento (fixture)", criadoPor: POR });
    await expect(registrarAbastecimento(prisma, { maquinaId, data: "2026-03-12", combustivel: "DIESEL", quantidade: "5", documento: "Cupom 12/03", ordemId, criadoPor: POR })).rejects.toThrow(/O condutor Carla Ciclomotor não estava ativo em 12\/03\/2026/);
    await expect(cadastrarCondutor(prisma, { nome: "Erro", matricula: "1005", cnhNumero: "44455566677", cnhCategoria: "AAC", cnhValidade: "2026-12-31", vinculo: "x", vigenteDesde: "2026-01-01", fundamento: "Categoria inexistente (fixture)", criadoPor: POR })).rejects.toThrow(/ou a ACC \(ciclomotor\)/);
    expect(await prisma.abastecimentoDaFrota.count()).toBe(0);
  });
});
