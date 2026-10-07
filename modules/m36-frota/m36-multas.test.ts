import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { cadastrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import { declararRoteiroPatrimonial } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { cadastrarVeiculo, registrarSituacaoDaFrota } from "./servico.js";
import { baixarMultaDeTransito, listarMultasDeTransito, registrarMultaDeTransito } from "./multas.js";

/**
 * V36 (TR 5.10.1.45) — AS MULTAS DE TRÂNSITO: o infrator, o valor e os lançamentos de controle.
 *
 * Fixture N=2: duas multas do mesmo veículo, de infratores diferentes (300,00 e 195,23), e uma terceira de 88,38 do
 * primeiro infrator. Em aberto: 583,61 (Maria 388,38; João 195,23). Baixada a de João: em aberto 388,38.
 *
 * ⚠️ AS CONTAS DE CONTROLE DA FIXTURE são as de "outros controles" do PCASP (7.9.9 / 8.9.9) — a escolha da conta é da
 * contabilidade do ente, pela tela de roteiros; o teste só precisa de um par do subsistema de controle.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "patrimonio@cg.pb.gov.br";
const C_D = "7.9.9.0.0.00.00";
const C_C = "8.9.9.0.0.00.00";
const MARIA = "52998224725";
const JOAO = "11144477735";
const LOCADORA = "11444777000161";
const FUNDAMENTO = "Fixture: par de contas de outros controles para o teste das multas";
const HOJE = diaCivil(new Date());
let veiculoId = "";

async function pessoa(documento: string, nome: string): Promise<void> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: documento.length === 14 ? "JURIDICA" : "FISICA", criadoPor: POR } });
  await prisma.versaoDePessoa.create({ data: { pessoaId: p.id, nome, criadoPor: POR } });
}
const declarar = async (chave: "REGISTRO" | "BAIXA") =>
  declararRoteiroPatrimonial(prisma, {
    familia: "MULTA_DE_TRANSITO", chave,
    contaDebitoCodigo: chave === "REGISTRO" ? C_D : C_C, contaCreditoCodigo: chave === "REGISTRO" ? C_C : C_D,
    historicoPadrao: chave === "REGISTRO" ? "Multa de trânsito notificada" : "Multa de trânsito baixada", fundamento: FUNDAMENTO, criadoPor: POR,
  });

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.entidadeContabil.create({ data: { id: "ent-pref", codigo: "0001", criadoPor: POR } });
  const ugId = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201001", nome: "Prefeitura Municipal", cnpj: "11222333000181", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref", vigenteDesde: meioDiaCivil("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
  await pessoa(MARIA, "Maria Condutora");
  await pessoa(JOAO, "João Condutor");
  await pessoa(LOCADORA, "Locadora Exemplo Ltda");
  await prisma.contaPcasp.createMany({
    data: [
      // Os nomes do plano do Tribunal (docs/oficial/tce-pb/pcasp-tcepb/plano-contas-2022.csv: 799000000 e 899000000).
      { codigo: C_D, nome: "DEMAIS CONTROLES", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: true },
      { codigo: C_C, nome: "DEMAIS CONTROLES", naturezaSaldo: "CREDORA", nivel: 3, analitica: true },
      // Um terceiro, para o roteiro da baixa que NÃO fecha o registro (t7).
      { codigo: "8.9.9.9.0.00.00", nome: "Conta de controle da fixture (outra)", naturezaSaldo: "CREDORA", nivel: 4, analitica: true },
    ],
  });
  veiculoId = (await cadastrarVeiculo(prisma, { ugId, placa: "ABC1234", anoModelo: 2022, renavam: "123456789", numeroModelo: "1234", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: "2026-02-01", situacaoInicial: "EM_USO", fundamento: "Documento do veículo (fixture)", criadoPor: POR })).id;
}, 120000);

const multa = (auto: string, valor: string, infratorDocumento: string, extra: Record<string, unknown> = {}) =>
  registrarMultaDeTransito(prisma, {
    veiculoId, orgaoAutuador: "DETRAN-PB", numeroDoAuto: auto, diaDaInfracao: "2026-03-10", diaDaNotificacao: "2026-04-02",
    local: "Esperança, Rua Principal", infracao: "Transitar em velocidade superior à máxima permitida em até 20%", valor, infratorDocumento, criadoPor: POR, ...extra,
  });
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "(não recusou)";
};
/** Saldo (débitos − créditos) de cada conta de controle, só dos lançamentos das multas. */
async function saldoDoControle(): Promise<Record<string, string>> {
  const ps = await prisma.partidaContabil.findMany({ where: { lancamento: { origemTipo: { startsWith: "MULTA_DE_TRANSITO" } } }, select: { tipo: true, valor: true, subsistema: true, conta: { select: { codigo: true } } } });
  const s: Record<string, Money> = {};
  for (const p of ps) {
    expect(p.subsistema).toBe("CONTROLE");
    const v = toMoney(p.valor.toFixed(2));
    const atual = s[p.conta.codigo] ?? toMoney("0");
    s[p.conta.codigo] = toMoney(p.tipo === "DEBITO" ? atual.plus(v) : atual.minus(v));
  }
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.toFixed(2)]));
}

describe("M36 — multas de trânsito", () => {
  it("t1: duas multas do veículo com infratores diferentes (N=2) e uma terceira; o controle lança na notificação e baixa na baixa", async () => {
    await declarar("REGISTRO");
    await declarar("BAIXA");
    const a = await multa("A-001", "300.00", MARIA);
    const b = await multa("A-002", "195.23", JOAO);
    await multa("A-003", "88.38", "529.982.247-25", { diaDaInfracao: "2026-03-20", diaDaNotificacao: "2026-04-05", diaDoVencimento: "2026-05-05" });
    expect(await saldoDoControle()).toEqual({ [C_D]: "583.61", [C_C]: "-583.61" });
    const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: a.lancamentoId }, select: { dataTransacao: true, origemTipo: true, origemId: true, historico: true } });
    expect([diaCivil(l.dataTransacao), l.origemTipo, l.origemId]).toEqual(["2026-04-02", "MULTA_DE_TRANSITO_REGISTRO", a.multaId]);
    expect(l.historico).toMatch(/Multa de trânsito notificada — auto A-001 \(DETRAN-PB\), veículo ABC1234, infrator Maria Condutora/);

    let q = await listarMultasDeTransito(prisma);
    expect([q.emAberto.quantidade, q.emAberto.valor.toFixed(2)]).toEqual([3, "583.61"]);
    expect(q.porInfrator.map((i) => `${i.nome}:${String(i.quantidade)}:${i.valor.toFixed(2)}`)).toEqual(["Maria Condutora:2:388.38", "João Condutor:1:195.23"]);

    await baixarMultaDeTransito(prisma, { multaId: b.multaId, tipo: "RESSARCIDA_PELO_INFRATOR", dia: "2026-04-20", observacao: "Guia paga pelo condutor em 20/04", criadoPor: POR });
    expect(await saldoDoControle()).toEqual({ [C_D]: "388.38", [C_C]: "-388.38" });
    q = await listarMultasDeTransito(prisma);
    expect([q.emAberto.quantidade, q.emAberto.valor.toFixed(2)]).toEqual([2, "388.38"]);
    expect(q.porInfrator.map((i) => i.nome)).toEqual(["Maria Condutora"]);
    expect(q.multas.find((m) => m.id === b.multaId)?.baixa).toMatchObject({ tipo: "RESSARCIDA_PELO_INFRATOR", dia: "2026-04-20" });
    expect((await listarMultasDeTransito(prisma, { soEmAberto: true })).multas.map((m) => m.numeroDoAuto).sort()).toEqual(["A-001", "A-003"]);
  });

  it("t2: sem o roteiro declarado, a multa é recusada dizendo onde declarar, e nada é gravado (nem o lançamento)", async () => {
    expect(await recusa(() => multa("A-001", "300.00", MARIA))).toMatch(/Não há roteiro para o registro da multa de trânsito: as contas de controle vêm da contabilidade do ente\. Declare-as em Contabilidade > Roteiros/);
    expect(await prisma.multaDeTransito.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "MULTA_DE_TRANSITO" } } })).toBe(0);
    await declarar("REGISTRO");
    const a = await multa("A-001", "300.00", MARIA);
    expect(await recusa(() => baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "PAGA_PELO_ENTE", dia: "2026-04-10", observacao: "Guia paga pelo ente", criadoPor: POR }))).toMatch(/Não há roteiro para a baixa da multa de trânsito/);
    expect(await prisma.baixaDaMultaDeTransito.count()).toBe(0);
  });

  it("t3: as recusas do registro e da baixa — cada uma diz por quê, e nada é gravado", async () => {
    await declarar("REGISTRO");
    await declarar("BAIXA");
    expect(await recusa(() => multa("A-001", "300.00", LOCADORA))).toMatch(/O infrator tem de ser pessoa física \(o condutor\); Locadora Exemplo Ltda é pessoa jurídica/);
    expect(await recusa(() => multa("A-001", "300.00", "39053344705"))).toMatch(/O infrator 39053344705 não está no cadastro de pessoas/);
    expect(await recusa(() => multa("A-001", "300.00", MARIA, { diaDaInfracao: "2026-01-31" }))).toMatch(/O veículo ABC1234 não estava na frota em 31\/01\/2026/);
    expect(await recusa(() => multa("A-001", "300.00", MARIA, { diaDaNotificacao: "2026-03-09" }))).toMatch(/A notificação \(09\/03\/2026\) não pode ser anterior à infração \(10\/03\/2026\)/);
    expect(await recusa(() => multa("A-001", "0.00", MARIA))).toMatch(/O valor da multa tem de ser maior que zero/);
    expect(await prisma.multaDeTransito.count()).toBe(0);

    const a = await multa("A-001", "300.00", MARIA);
    expect(await recusa(() => multa("A-001", "120.00", JOAO))).toMatch(/O auto A-001 de DETRAN-PB já está registrado \(veículo ABC1234\)/);
    await registrarSituacaoDaFrota(prisma, { veiculoId, situacao: "BAIXADA", desde: "2026-06-01", motivo: "Leilão do veículo", criadoPor: POR });
    expect(await recusa(() => multa("A-009", "50.00", MARIA, { diaDaInfracao: "2026-06-02", diaDaNotificacao: "2026-06-10" }))).toMatch(/O veículo ABC1234 estava baixado em 02\/06\/2026/);

    expect(await recusa(() => baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "CANCELADA_EM_RECURSO", dia: "2026-04-01", observacao: "Recurso deferido pela JARI", criadoPor: POR }))).toMatch(/A baixa \(01\/04\/2026\) não pode ser anterior à notificação da multa \(02\/04\/2026\)/);
    await baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "CANCELADA_EM_RECURSO", dia: "2026-04-15", observacao: "Recurso deferido pela JARI", criadoPor: POR });
    expect(await recusa(() => baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "PAGA_PELO_ENTE", dia: HOJE, observacao: "Guia paga pelo ente", criadoPor: POR }))).toMatch(/A multa do auto A-001 já foi baixada \(Cancelada em recurso\)/);
    expect(await prisma.multaDeTransito.count()).toBe(1);
    expect(await prisma.baixaDaMultaDeTransito.count()).toBe(1);
    expect(await saldoDoControle()).toEqual({ [C_D]: "0.00", [C_C]: "0.00" });
  });

  it("t4: quem só consulta o patrimônio não registra nem baixa multa; a recusa nomeia a ação", async () => {
    await declarar("REGISTRO");
    await declarar("BAIXA");
    const a = await multa("A-001", "300.00", MARIA);
    const u = await prisma.usuario.create({ data: { identificador: "so.le.frota@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_FROTA", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PATRIMONIO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => multa("A-002", "100.00", JOAO, { criadoPor: "so.le.frota@cg.pb.gov.br" }))).toMatch(/CADASTRAR_FROTA/);
    expect(await recusa(() => baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "PAGA_PELO_ENTE", dia: "2026-04-10", observacao: "Guia paga pelo ente", criadoPor: "so.le.frota@cg.pb.gov.br" }))).toMatch(/CADASTRAR_FROTA/);
    expect(await prisma.multaDeTransito.count()).toBe(1);
    expect(await prisma.baixaDaMultaDeTransito.count()).toBe(0);
  });

  it("t5: o mesmo auto escrito de outro jeito (órgão com barra e minúsculas, auto com espaço) é o mesmo auto", async () => {
    await declarar("REGISTRO");
    await multa("A-001", "300.00", MARIA);
    expect(await recusa(() => multa("a-001 ", "300.00", JOAO, { orgaoAutuador: "Detran/PB" }))).toMatch(/O auto A-001 de DETRAN-PB já está registrado \(veículo ABC1234\)/);
    expect(await prisma.multaDeTransito.count()).toBe(1);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "MULTA_DE_TRANSITO" } } })).toBe(1);
  });

  it("t6: notificação no futuro e dia inexistente são recusados antes de lançar", async () => {
    await declarar("REGISTRO");
    const amanha = diaCivil(new Date(Date.now() + 36 * 3600 * 1000));
    expect(await recusa(() => multa("A-001", "300.00", MARIA, { diaDaNotificacao: amanha }))).toMatch(/A data da notificação \(\d{2}\/\d{2}\/\d{4}\) está no futuro/);
    expect(await recusa(() => multa("A-001", "300.00", MARIA, { diaDaNotificacao: "2026-02-31" }))).toMatch(/Data inexistente/);
    expect(await prisma.multaDeTransito.count()).toBe(0);
  });

  it("t7: a baixa só fecha o controle se debitar a conta que o registro creditou; o registro indevido é o estorno do registro", async () => {
    await declarar("REGISTRO");
    const a = await multa("A-001", "300.00", MARIA);
    const b = await multa("A-002", "195.23", JOAO);
    // Um roteiro de baixa que não é o inverso do registro.
    await declararRoteiroPatrimonial(prisma, { familia: "MULTA_DE_TRANSITO", chave: "BAIXA", contaDebitoCodigo: "8.9.9.9.0.00.00", contaCreditoCodigo: C_D, historicoPadrao: "Baixa com outro par", fundamento: FUNDAMENTO, criadoPor: POR });
    expect(await recusa(() => baixarMultaDeTransito(prisma, { multaId: a.multaId, tipo: "PAGA_PELO_ENTE", dia: "2026-04-10", observacao: "Guia paga pelo ente", criadoPor: POR }))).toMatch(/O roteiro da baixa debita a conta 8\.9\.9\.9\.0\.00\.00, mas a multa do auto A-001 foi registrada creditando a 8\.9\.9\.0\.0\.00\.00/);
    expect(await prisma.baixaDaMultaDeTransito.count()).toBe(0);

    // O registro indevido não depende do roteiro da baixa: estorna o lançamento do registro, apontando para ele.
    const r = await baixarMultaDeTransito(prisma, { multaId: b.multaId, tipo: "REGISTRO_INDEVIDO", dia: "2026-04-10", observacao: "Auto lançado em duplicidade", criadoPor: POR });
    const est = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: r.lancamentoId }, select: { estornoDeId: true } });
    expect(est.estornoDeId).toBe(b.lancamentoId);
    expect(await saldoDoControle()).toEqual({ [C_D]: "300.00", [C_C]: "-300.00" });
  });

  it("t8: com a competência da notificação travada, nada é gravado (nem a multa, nem o lançamento)", async () => {
    await declarar("REGISTRO");
    const { travar: travarCompetencia } = await import("../m16-travamento/servico.js");
    await travarCompetencia(prisma, { competencia: "2026-04", criadoPor: POR });
    expect(await recusa(() => multa("A-001", "300.00", MARIA))).toMatch(/COMPETÊNCIA TRAVADA/);
    expect(await prisma.multaDeTransito.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "MULTA_DE_TRANSITO" } } })).toBe(0);
  });

  it("t9: o mesmo auto em dois veículos ao mesmo tempo — um grava, o outro é recusado com o motivo", async () => {
    await declarar("REGISTRO");
    const ugId = (await prisma.veiculoDaFrota.findUniqueOrThrow({ where: { id: veiculoId }, select: { ugId: true } })).ugId;
    const outro = (await cadastrarVeiculo(prisma, { ugId, placa: "XYZ9876", anoModelo: 2022, renavam: "987654321", numeroModelo: "1234", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: "2026-02-01", situacaoInicial: "EM_USO", fundamento: "Documento do veículo (fixture)", criadoPor: POR })).id;
    const infrator = await prisma.pessoa.findUniqueOrThrow({ where: { documento: JOAO }, select: { id: true } });
    // Determinístico: uma transação grava o auto no OUTRO veículo e fica aberta; o registro no primeiro passa pela leitura
    // (não vê a linha não confirmada), lança e espera no índice único; quando a primeira confirma, ele recebe a violação.
    let gravou = (): void => undefined;
    let liberar = (): void => undefined;
    const pegou = new Promise<void>((r) => (gravou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const primeira = prisma.$transaction(
      async (tx) => {
        await tx.multaDeTransito.create({ data: { veiculoId: outro, orgaoAutuador: "DETRAN-PB", numeroDoAuto: "A-001", dataDaInfracao: meioDiaCivil("2026-03-10"), dataDaNotificacao: meioDiaCivil("2026-04-02"), local: "x", infracao: "Registro simultâneo", valor: "10.00", infratorId: infrator.id, lancamentoId: "lanc-simultaneo", criadoPor: POR } });
        gravou();
        await segura;
      },
      { timeout: 60000 }
    );
    await pegou;
    const segunda = multa("A-001", "300.00", MARIA).then(() => "(gravou)", (e: unknown) => (e as Error).message);
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [l] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'transactionid' AND datname = current_database()`;
      vista = (l?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await primeira;
    expect(vista, "o segundo registro não chegou a esperar o índice único").toBe(true);
    expect(await segunda).toMatch(/O auto A-001 de DETRAN-PB foi registrado ao mesmo tempo em outra operação/);
    expect(await prisma.multaDeTransito.count()).toBe(1);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "MULTA_DE_TRANSITO" } } })).toBe(0);
  });
});
