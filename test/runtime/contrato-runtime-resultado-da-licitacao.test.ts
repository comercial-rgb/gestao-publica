import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { cadastrarContrato, cadastrarProcesso, saldoDoContrato } from "../../modules/m11-licitacoes/contratos.js";
import {
  adjudicar, cadastrarContratoDaAta, cadastrarContratoDoResultado, cadastrarItemDoProcesso, homologarPorAto, quadroDoResultado,
  registrarAta, registrarProposta, registrarResultado, vincularParticipante,
} from "../../modules/m11-licitacoes/resultado-da-licitacao.js";

/**
 * ═══ DO PROCESSO AO CONTRATO, PELO PAPEL DE RUNTIME (V39-R2: R2-014 a 020) ═══
 *
 * Duas pessoas (segregação): o AGENTE cadastra, julga e contrata; a AUTORIDADE adjudica e homologa.
 * Contas e decisões escritas antes do código:
 *   Itens: 1 cimento (100 sacos, avulso); 2 areia (20 m³, lote 1); 3 brita (10 m³, lote 1).
 *   Participantes (pessoas do cadastro): A = Construmat, B = Pedreira Sul.
 *   Propostas: item 1 — A 30,00, B 28,50, e A corrige para 29,00 (versão 2, com motivo).
 *              Lote 1 — A 100,00 e 200,00 (total 20×100 + 10×200 = 4.000,00); B 110,00 e 140,00 (total 3.600,00).
 *   Resultado (menor preço): item 1 vence A a 29,00 — há proposta melhor (B 28,50), o ato exige a justificativa.
 *              Lote 1 vence B (105,00 e 140,00) SEM justificativa: o lote se compara pelo TOTAL, e B é o menor, ainda
 *              que A seja mais barato na areia.
 *   Homologação: ato 1 (itens 1 e 2); ato 2 corrige o 1 e alcança 1, 2 e 3.
 *   Contrato do resultado: A, item 1, 60 sacos → 60 × 29,00 = R$ 1.740,00; restam 40.
 *   Corrida (N=2): dois contratos de 30 sacos sobre os 40 → um passa, o outro é recusado.
 *   Ata: B, areia 15 e brita 8. Contrato da ata: areia 10 → R$ 1.050,00; saldo da ata 5 m³ (R$ 525,00).
 *   Arredondamento (N=2 itens, meio para o par): areia 2 × 110,0025 = 220,005 → 220,00; brita 1 × 140,005 = 140,005 →
 *              140,00; contrato = 360,00 (meio para cima daria 360,02).
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => {
  await dono.$disconnect();
  await app.$disconnect();
});

const AGENTE = "agente.rt-resultado@teste.local";
const AUTORIDADE = "autoridade.rt-resultado@teste.local";
const TUDO = "tudo.rt-resultado@teste.local";
const negado = /permission denied|permissão negada/i;
const dia = (d: number): Date => new Date(`${diaCivil(new Date(Date.now() + d * 86_400_000))}T15:00:00.000Z`);
const CNPJ_A = "11222333000181";
const CNPJ_B = "12345678000195";

let processoId = "";
let itens: { c: string; areia: string; brita: string } = { c: "", areia: "", brita: "" };
let partA = "";
let partB = "";

beforeEach(async () => {
  await limparBanco(dono);
  const perfil = async (nome: string, ident: string, acoes: readonly string[]): Promise<void> => {
    const p = await dono.perfil.create({ data: { nome, descricao: "rt", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
    const u = await dono.usuario.create({ data: { identificador: ident, nome: ident, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  };
  await perfil("RT-AGENTE", AGENTE, ["CADASTRAR_PROCESSO", "REGISTRAR_RESULTADO_DA_LICITACAO", "CADASTRAR_CONTRATO"]);
  await perfil("RT-AUTORIDADE", AUTORIDADE, ["ADJUDICAR_LICITACAO", "HOMOLOGAR_PROCESSO"]);
  await perfil("RT-TUDO", TUDO, ["CADASTRAR_PROCESSO", "REGISTRAR_RESULTADO_DA_LICITACAO", "ADJUDICAR_LICITACAO", "HOMOLOGAR_PROCESSO", "CADASTRAR_CONTRATO"]);
  for (const [doc, nome] of [[CNPJ_A, "Construmat Materiais Ltda"], [CNPJ_B, "Pedreira Sul Ltda"]] as const) {
    await dono.pessoa.create({ data: { documento: doc, tipo: "JURIDICA", criadoPor: "SEED", versoes: { create: { nome, criadoPor: "SEED" } } } });
  }
  processoId = (await cadastrarProcesso(app, { numeroProcesso: "RT-PE-07/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Materiais de construção para manutenção", valorLicitado: "50000.00", criadoPor: AGENTE })).processoId;
  const item = async (numero: number, descricao: string, unidade: string, quantidade: string, lote?: number) =>
    (await cadastrarItemDoProcesso(app, { processoId, numero, descricao, unidade, quantidade, ...(lote === undefined ? {} : { lote }), criadoPor: AGENTE })).itemId;
  itens = { c: await item(1, "Cimento CP-II 50 kg", "saco", "100"), areia: await item(2, "Areia lavada", "m3", "20", 1), brita: await item(3, "Brita 1", "m3", "10", 1) };
  partA = (await vincularParticipante(app, { processoId, documento: "11.222.333/0001-81", criadoPor: AGENTE })).participanteId;
  partB = (await vincularParticipante(app, { processoId, documento: CNPJ_B, criadoPor: AGENTE })).participanteId;
}, 180_000);

const prop = (participanteId: string, abrangencia: "ITEM" | "LOTE", valores: { itemId: string; valorUnitario: string }[], motivo?: string) =>
  registrarProposta(app, { participanteId, abrangencia, valores, documento: "Proposta pelo sistema de compras", ...(motivo === undefined ? {} : { motivo }), criadoPor: AGENTE });
const baseDoResultado = () => ({ processoId, data: dia(-10), criterio: "MENOR_PRECO" as const, fundamento: "Ata da sessão pública do pregão", documento: "Ata 07/2026", criadoPor: AGENTE });

/** Propostas, resultado (pelo agente), adjudicação e homologação (pela autoridade; ato 1 com 1 e 2, ato 2 corrige com 1, 2 e 3). */
async function ateHomologar(lb = { areia: "110.00", brita: "140.00", finalAreia: "105.00", finalBrita: "140.00" }): Promise<{ readonly linhas: Record<"c" | "areia" | "brita", string>; readonly ato1: string; readonly ato2: string; readonly adj: (l: string) => string }> {
  await prop(partA, "ITEM", [{ itemId: itens.c, valorUnitario: "30.00" }]);
  await prop(partB, "ITEM", [{ itemId: itens.c, valorUnitario: "28.50" }]);
  await prop(partA, "LOTE", [{ itemId: itens.areia, valorUnitario: "100.00" }, { itemId: itens.brita, valorUnitario: "200.00" }]);
  await prop(partB, "LOTE", [{ itemId: itens.areia, valorUnitario: lb.areia }, { itemId: itens.brita, valorUnitario: lb.brita }]);
  await prop(partA, "ITEM", [{ itemId: itens.c, valorUnitario: "29.00" }], "Correção de erro de digitação no valor unitário");
  await registrarResultado(app, { ...baseDoResultado(), itens: [
    { itemId: itens.c, situacao: "VENCEDOR", participanteId: partA, valorUnitario: "29.00", justificativa: "A Pedreira Sul foi inabilitada no item 1 por certidão fiscal vencida" },
    // o lote: B é o menor TOTAL (3.600 contra 4.000), mesmo com A mais barato na areia — sem justificativa
    { itemId: itens.areia, situacao: "VENCEDOR", participanteId: partB, valorUnitario: lb.finalAreia },
    { itemId: itens.brita, situacao: "VENCEDOR", participanteId: partB, valorUnitario: lb.finalBrita },
  ] });
  const quadro = await quadroDoResultado(app, processoId);
  const linha = (id: string): string => quadro.itens.find((i) => i.id === id)!.resultado!.id;
  const linhas = { c: linha(itens.c), areia: linha(itens.areia), brita: linha(itens.brita) };
  await adjudicar(app, { processoId, data: dia(-8), autoridade: "Secretário de Administração", documento: "Termo de adjudicação 07/2026", itensDoResultado: [linhas.c, linhas.areia, linhas.brita], criadoPor: AUTORIDADE });
  const adjs = await dono.itemAdjudicado.findMany({ select: { id: true, itemDoResultadoId: true } });
  const adj = (l: string): string => adjs.find((a) => a.itemDoResultadoId === l)!.id;
  const ato1 = (await homologarPorAto(app, { processoId, data: dia(-5), autoridade: "Prefeito", documento: "Termo de homologação 07/2026", itensAdjudicados: [adj(linhas.c), adj(linhas.areia)], criadoPor: AUTORIDADE })).atoId;
  const ato2 = (await homologarPorAto(app, { processoId, data: dia(-3), autoridade: "Prefeito", documento: "Termo de homologação 07/2026-A", itensAdjudicados: [adj(linhas.c), adj(linhas.areia), adj(linhas.brita)], corrigeId: ato1, motivo: "O item 3 ficou de fora do primeiro termo por lapso", criadoPor: AUTORIDADE })).atoId;
  return { linhas, ato1, ato2, adj };
}

const dadosDoContrato = (numeroContrato: string, inicio = dia(-2)) => ({ numeroContrato, vigenciaInicio: inicio, vigenciaFimInicial: dia(300), categoriaOrdemCronologica: "FORNECIMENTO_BENS" as const, criadoPor: AGENTE });

describe("do processo ao contrato pelo papel de runtime", () => {
  it("propostas e resultado: o ato escolhe o vencedor, com justificativa quando há proposta melhor; o lote vai inteiro", async () => {
    await prop(partA, "ITEM", [{ itemId: itens.c, valorUnitario: "30.00" }]);
    await prop(partB, "ITEM", [{ itemId: itens.c, valorUnitario: "28.50" }]);
    await expect(registrarProposta(app, { participanteId: partA, abrangencia: "ITEM", valores: [{ itemId: itens.c, valorUnitario: "29.00" }], documento: "Proposta A", criadoPor: AGENTE }))
      .rejects.toThrow(/a nova é a versão 2 e precisa do motivo/);
    await expect(registrarProposta(app, { participanteId: partB, abrangencia: "LOTE", valores: [{ itemId: itens.areia, valorUnitario: "110.00" }], documento: "Proposta B", criadoPor: AGENTE }))
      .rejects.toThrow(/A proposta do lote 1 precisa cobrir os 2 itens dele; vieram 1/);
    await expect(registrarResultado(app, { ...baseDoResultado(), itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partA, valorUnitario: "30.00" }] }))
      .rejects.toThrow(/há proposta mais vantajosa pelo critério \(28\.5000 contra 30\.0000 do escolhido\)/);
    await expect(registrarResultado(app, { ...baseDoResultado(), itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partB, valorUnitario: "29.00" }] }))
      .rejects.toThrow(/o valor final \(29\.0000\) passa do proposto pelo vencedor \(28\.5000\)/);
    await expect(registrarResultado(app, { ...baseDoResultado(), itens: [{ itemId: itens.areia, situacao: "DESERTO" }] }))
      .rejects.toThrow(/O lote 1 se julga inteiro: tem 2 itens e o ato trouxe 1/);
    expect(await dono.resultadoDoProcesso.count()).toBe(0);
    // segregação por AÇÃO: a autoridade (sem a ação de julgar) não julga
    await expect(registrarResultado(app, { ...baseDoResultado(), criadoPor: AUTORIDADE, itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partB, valorUnitario: "28.50" }] }))
      .rejects.toThrow(/REGISTRAR_RESULTADO_DA_LICITACAO/);
    await registrarResultado(app, { ...baseDoResultado(), itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partB, valorUnitario: "28.50" }] });
    // proposta depois do julgamento: recusada pelo motivo
    await expect(prop(partA, "ITEM", [{ itemId: itens.c, valorUnitario: "27.00" }], "Nova proposta depois da sessão"))
      .rejects.toThrow(/O item 1 já foi julgado: a proposta não muda depois do resultado/);
    const r2 = await registrarResultado(app, { ...baseDoResultado(), itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partA, valorUnitario: "30.00", justificativa: "Recurso provido: B inabilitada por certidão fiscal vencida" }] });
    expect(r2.corrigidos).toBe(1);
    const c = (await quadroDoResultado(app, processoId)).itens.find((i) => i.id === itens.c)!;
    expect([c.resultado?.participante, c.resultado?.valorUnitario, c.resultado?.corrigido]).toEqual(["Construmat Materiais Ltda", "30.0000", true]);
    expect(await dono.itemDoResultado.count({ where: { itemId: itens.c } })).toBe(2);
    await expect(app.itemDoResultado.updateMany({ where: { itemId: itens.c }, data: { valorUnitario: "1.00" } })).rejects.toThrow(negado);
    await expect(app.propostaDoParticipante.deleteMany({ where: { itemId: itens.c } })).rejects.toThrow(negado);
  }, 180_000);

  it("segregação: quem julgou não adjudica nem homologa; ações faltando são recusadas pelo nome; item adjudicado não se rejulga", async () => {
    await prop(partA, "ITEM", [{ itemId: itens.c, valorUnitario: "30.00" }]);
    await registrarResultado(app, { ...baseDoResultado(), criadoPor: TUDO, itens: [{ itemId: itens.c, situacao: "VENCEDOR", participanteId: partA, valorUnitario: "30.00" }] });
    const linha = (await quadroDoResultado(app, processoId)).itens.find((i) => i.id === itens.c)!.resultado!.id;
    const adjDe = (criadoPor: string) => adjudicar(app, { processoId, data: dia(-8), autoridade: "Secretário", documento: "Termo", itensDoResultado: [linha], criadoPor });
    await expect(adjDe(TUDO)).rejects.toThrow(/SEGREGACAO: o resultado do item 1 foi registrado por esta mesma pessoa; a adjudicação é de outra autoridade/);
    await expect(adjDe(AGENTE)).rejects.toThrow(/ADJUDICAR_LICITACAO/);
    await adjDe(AUTORIDADE);
    const adj = (await dono.itemAdjudicado.findFirstOrThrow({ select: { id: true } })).id;
    const homDe = (criadoPor: string) => homologarPorAto(app, { processoId, data: dia(-5), autoridade: "Prefeito", documento: "Termo", itensAdjudicados: [adj], criadoPor });
    await expect(homDe(TUDO)).rejects.toThrow(/SEGREGACAO: o resultado do item 1 foi registrado por esta mesma pessoa; a homologação é de outra autoridade/);
    await expect(homDe(AGENTE)).rejects.toThrow(/HOMOLOGAR_PROCESSO/);
    await expect(registrarResultado(app, { ...baseDoResultado(), criadoPor: TUDO, itens: [{ itemId: itens.c, situacao: "DESERTO" }] }))
      .rejects.toThrow(/O item 1 já foi adjudicado: o resultado dele não se corrige por este ato/);
    await homDe(AUTORIDADE);
    // a autoridade não contrata (não tem a ação)
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linha, quantidade: "1" }], ...dadosDoContrato("CT-AUT"), criadoPor: AUTORIDADE }))
      .rejects.toThrow(/CADASTRAR_CONTRATO/);
  }, 180_000);

  it("contrato do resultado: transporta contratado, itens e preços; saldo por item; correção e cadastro avulso não furam", async () => {
    const { linhas, ato2, adj } = await ateHomologar();
    expect(diaCivil((await dono.homologacaoProcesso.findUniqueOrThrow({ where: { processoId } })).data)).toBe(diaCivil(dia(-5)));
    const q = await quadroDoResultado(app, processoId);
    expect(q.atos.map((a) => [a.corrigido, a.itens])).toEqual([[true, [1, 2]], [false, [1, 2, 3]]]);
    expect(q.itens.every((i) => i.homologado?.atoId === ato2)).toBe(true);

    // pedido com o mesmo item duas vezes: recusado antes de ler o saldo
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "40" }, { id: linhas.c, quantidade: "40" }], ...dadosDoContrato("CT-DUP") }))
      .rejects.toThrow(/Um item aparece duas vezes no pedido/);
    const r = await cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "60" }], ...dadosDoContrato("CT-07/2026-A") });
    expect(r.valor).toBe("1740.00");
    const ct = await dono.contrato.findUniqueOrThrow({ where: { id: r.contratoId }, select: { contratadoDocumento: true, contratadoNome: true, valorInicial: true, itens: { select: { descricao: true, unidade: true, quantidade: true, valorUnitario: true } } } });
    expect([ct.contratadoDocumento, ct.contratadoNome, ct.valorInicial.toFixed(2)]).toEqual([CNPJ_A, "Construmat Materiais Ltda", "1740.00"]);
    expect(ct.itens.map((i) => [i.descricao, i.unidade, i.quantidade.toFixed(4), i.valorUnitario.toFixed(4)])).toEqual([["Cimento CP-II 50 kg", "saco", "60.0000", "29.0000"]]);
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "41" }], ...dadosDoContrato("CT-07/2026-B") }))
      .rejects.toThrow(/O item 1 tem 40\.0000 saco a contratar \(licitado 100\.0000, já contratado 60\.0000\); o contrato pede 41\.0000/);
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.areia, quantidade: "1" }], ...dadosDoContrato("CT-X") }))
      .rejects.toThrow(/O item 2 foi vencido por outro participante/);
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partB, itens: [{ id: linhas.brita, quantidade: "1" }], ...dadosDoContrato("CT-Y", dia(-4)) }))
      .rejects.toThrow(/não pode começar .* antes da homologação do item 3/);
    // a correção não tira item contratado, nem leva a homologação para depois do contrato
    const semC = [adj(linhas.areia), adj(linhas.brita)];
    await expect(homologarPorAto(app, { processoId, data: dia(-4), autoridade: "Prefeito", documento: "Termo B", itensAdjudicados: semC, corrigeId: ato2, motivo: "Exclusão do item 1 por decisão posterior", criadoPor: AUTORIDADE }))
      .rejects.toThrow(/O item 1 já foi contratado ou registrado em ata: a correção não o tira da homologação/);
    await expect(homologarPorAto(app, { processoId, data: dia(-1), autoridade: "Prefeito", documento: "Termo C", itensAdjudicados: [adj(linhas.c), ...semC], corrigeId: ato2, motivo: "Retificação da data do termo de homologação", criadoPor: AUTORIDADE }))
      .rejects.toThrow(/O item 1 está no contrato CT-07\/2026-A, vigente desde .*: a homologação não pode passar a ser de/);
    // o cadastro avulso de contrato não alcança processo com itens
    await expect(cadastrarContrato(app, { numeroContrato: "CT-AVULSO", processoId, contratadoDocumento: CNPJ_B, contratadoNome: "Pedreira Sul Ltda", valorInicial: "50000.00", vigenciaInicio: dia(-2), vigenciaFimInicial: dia(300), categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: AGENTE }))
      .rejects.toThrow(/PROCESSO-COM-ITENS: este processo tem itens e resultado por item/);
    // a ata não registra item já contratado direto
    await expect(registrarAta(app, { processoId, numero: "ARP-X", vigenciaInicio: dia(-2), vigenciaFim: dia(300), documento: "Ata", itens: [{ id: linhas.c, quantidade: "10" }], criadoPor: AGENTE }))
      .rejects.toThrow(/O item 1 já foi contratado direto do resultado: a ata não o registra/);
  }, 240_000);

  it("valor do contrato com dois itens: centavos por item, meio para o par (360,00 e não 360,02)", async () => {
    const { linhas } = await ateHomologar({ areia: "110.0025", brita: "140.0050", finalAreia: "110.0025", finalBrita: "140.0050" });
    const r = await cadastrarContratoDoResultado(app, { processoId, participanteId: partB, itens: [{ id: linhas.areia, quantidade: "2" }, { id: linhas.brita, quantidade: "1" }], ...dadosDoContrato("CT-ARRED") });
    expect(r.valor).toBe("360.00");
    expect((await dono.contrato.findUniqueOrThrow({ where: { id: r.contratoId }, select: { valorInicial: true } })).valorInicial.toFixed(2)).toBe("360.00");
  }, 240_000);

  it("corrida (N=2): dois contratos sobre os mesmos 40 sacos restantes — um passa, o outro é recusado pelo saldo", async () => {
    const { linhas } = await ateHomologar();
    await cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "60" }], ...dadosDoContrato("CT-BASE") });
    const r = await Promise.allSettled([
      cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "30" }], ...dadosDoContrato("CT-C1") }),
      cadastrarContratoDoResultado(app, { processoId, participanteId: partA, itens: [{ id: linhas.c, quantidade: "30" }], ...dadosDoContrato("CT-C2") }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    const recusa = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(String(recusa.reason)).toMatch(/O item 1 tem 10\.0000 saco a contratar \(licitado 100\.0000, já contratado 90\.0000\)/);
    const total = await dono.itemContratadoDoResultado.findMany({ where: { itemDoResultadoId: linhas.c }, select: { quantidade: true } });
    expect(total.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0)).toFixed(4)).toBe("90.0000");
  }, 240_000);

  it("ata de registro de preços: saldo da ata, saldo do contrato e dotação são controles distintos; ata vencida não contrata", async () => {
    const { linhas } = await ateHomologar();
    const { ataId } = await registrarAta(app, { processoId, numero: "ARP-07/2026", vigenciaInicio: dia(-2), vigenciaFim: dia(360), documento: "Ata de registro de preços 07/2026", itens: [{ id: linhas.areia, quantidade: "15" }, { id: linhas.brita, quantidade: "8" }], criadoPor: AGENTE });
    const itensDaAta = await dono.itemDaAta.findMany({ where: { ataId }, select: { id: true, itemDoResultadoId: true } });
    const daAta = (l: string): string => itensDaAta.find((i) => i.itemDoResultadoId === l)!.id;
    await expect(cadastrarContratoDoResultado(app, { processoId, participanteId: partB, itens: [{ id: linhas.areia, quantidade: "1" }], ...dadosDoContrato("CT-DIRETO") }))
      .rejects.toThrow(/O item 2 está registrado em ata de registro de preços: contrate pela ata/);
    await expect(registrarAta(app, { processoId, numero: "ARP-08/2026", vigenciaInicio: dia(-2), vigenciaFim: dia(360), documento: "Outra ata", itens: [{ id: linhas.areia, quantidade: "6" }], criadoPor: AGENTE }))
      .rejects.toThrow(/O item 2 tem 5\.0000 m3 a registrar \(licitado 20\.0000, contratado 0\.0000, em ata 15\.0000\); a ata pede 6\.0000/);
    const c = await cadastrarContratoDaAta(app, { ataId, participanteId: partB, itens: [{ id: daAta(linhas.areia), quantidade: "10" }], ...dadosDoContrato("CT-ARP-1", dia(-1)) });
    expect(c.valor).toBe("1050.00");
    await expect(cadastrarContratoDaAta(app, { ataId, participanteId: partB, itens: [{ id: daAta(linhas.areia), quantidade: "6" }], ...dadosDoContrato("CT-ARP-2", dia(-1)) }))
      .rejects.toThrow(/O item 2 tem saldo de 5\.0000 m3 na ata ARP-07\/2026 \(registrado 15\.0000, contratado 10\.0000\); o contrato pede 6\.0000/);
    await expect(cadastrarContratoDaAta(app, { ataId, participanteId: partB, itens: [{ id: daAta(linhas.areia), quantidade: "1" }], ...dadosDoContrato("CT-ARP-3", dia(-3)) }))
      .rejects.toThrow(/A ata ARP-07\/2026 vale de .* o contrato começa em/);
    const q = await quadroDoResultado(app, processoId);
    const areia = q.atas[0]!.itens.find((i) => i.item === 2)!;
    expect([areia.registrado, areia.contratado, areia.saldo, areia.saldoEmReais, areia.fornecedor]).toEqual(["15.0000", "10.0000", "5.0000", "525.00", "Pedreira Sul Ltda"]);
    expect((await saldoDoContrato(app, c.contratoId)).toFixed(2)).toBe("1050.00");
    expect(await dono.movimentoDotacao.count()).toBe(0);
    // uma ata que JÁ VENCEU não contrata, mesmo com início do contrato dentro da vigência dela
    const vencida = await registrarAta(app, { processoId, numero: "ARP-VENCIDA", vigenciaInicio: dia(-3), vigenciaFim: dia(-1), documento: "Ata curta", itens: [{ id: linhas.brita, quantidade: "2" }], criadoPor: AGENTE });
    const iv = (await dono.itemDaAta.findFirstOrThrow({ where: { ataId: vencida.ataId }, select: { id: true } })).id;
    await expect(cadastrarContratoDaAta(app, { ataId: vencida.ataId, participanteId: partB, itens: [{ id: iv, quantidade: "1" }], ...dadosDoContrato("CT-VENC", dia(-2)) }))
      .rejects.toThrow(/A ata ARP-VENCIDA venceu em .*: não se contrata mais por ela/);
  }, 240_000);
});
