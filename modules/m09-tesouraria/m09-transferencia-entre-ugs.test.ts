import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { cadastrarUnidadeGestora, encerrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import {
  conciliacaoDasTransferenciasEntreUgs,
  definirContabilizacaoDaTransferenciaEntreUgs,
  estornarTransferenciaEntreUgs,
  registrarTransferenciaEntreUgs,
} from "./transferencia-entre-ugs.js";
import { gerarTransfConcedida, gerarTransfRecebida } from "../../adapters/tribunais/tce-pb/sagres/gerador-v26.js";

/**
 * V26 (ordem, item 2.9) — UNIDADES GESTORAS E A TRANSFERÊNCIA FINANCEIRA ENTRE ELAS (regime de profundidade: tesouraria).
 *
 * As contas do PCASP são as do plano do TCE-PB 2025 (3.5.1.1.2.02.00 repasse concedido, 4.5.1.1.2.02.00 repasse
 * recebido, 1.1.1.1.1.19.00 bancos); a decisão de usá-las no duodécimo é do teste, como seria do ente na tela.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "tesouraria@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
const CNPJ = "11222333000181";

let ugPref = "";
let ugCam = "";

async function entidade(id: string, codigo: string, nome: string): Promise<void> {
  await prisma.entidadeContabil.create({ data: { id, codigo, criadoPor: POR } });
  await prisma.versaoDaEntidadeContabil.create({
    data: { entidadeId: id, versao: 1, nome, tipoManad: codigo === "0001" ? "01" : "02", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica", criadoPor: POR },
  });
}
async function titular(contaBancariaId: string, entidadeId: string): Promise<void> {
  await prisma.declaracaoDeTitularDaConta.create({
    data: { contaBancariaId, entidadeId, versao: 1, atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica", criadoPor: POR },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-banco", codigo: "1.1.1.1.1.19.00", nome: "BANCOS CONTA MOVIMENTO - DEMAIS CONTAS", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: "3.5.1.1.2.02.00", nome: "REPASSE CONCEDIDO", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-vpa", codigo: "4.5.1.1.2.02.00", nome: "REPASSE RECEBIDO", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { id: "c-vpd-sint", codigo: "3.5.1.1.2.00.00", nome: "TRANSFERÊNCIAS CONCEDIDAS PARA A EXECUÇÃO ORÇAMENTÁRIA - INTRA OFSS", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false },
      { id: "c-distrib", codigo: "3.5.2.1.1.00.00", nome: "DISTRIBUIÇÃO CONSTITUCIONAL OU LEGAL DE RECEITAS - CONSOLIDAÇÃO", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Recursos não vinculados", codigoTce: "500" } });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-pref", codigo: "CC-PREF", descricao: "Prefeitura — movimento", fonteId: "fnt-500", contaContabilId: "c-banco", banco: "001", agencia: "1234", digitoAgencia: "5", conta: "11111", digitoConta: "1" },
      { id: "cb-cam", codigo: "CC-CAM", descricao: "Câmara — movimento", fonteId: "fnt-500", contaContabilId: "c-banco", banco: "001", agencia: "1234", digitoAgencia: "5", conta: "22222", digitoConta: "2" },
    ],
  });
  await entidade("ent-pref", "0001", "Prefeitura Municipal");
  await entidade("ent-cam", "0002", "Câmara Municipal");
  await titular("cb-pref", "ent-pref");
  await titular("cb-cam", "ent-cam");
  ugPref = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201001", nome: "Prefeitura Municipal", cnpj: null, naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref", vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
  ugCam = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201002", nome: "Câmara Municipal", cnpj: null, naturezaJuridica: "CAMARA_MUNICIPAL", entidadeContabilId: "ent-cam", vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
}, 120000);
afterAll(async () => prisma.$disconnect());

const contabilizar = (): Promise<{ id: string }> =>
  definirContabilizacaoDaTransferenciaEntreUgs(prisma, { tipo: "DUODECIMO", contaConcedidaCodigo: "3.5.1.1.2.02.00", contaRecebidaCodigo: "4.5.1.1.2.02.00", vigenteDesde: D("2026-01-01"), fundamento: "PCASP do TCE-PB 2025: repasse concedido e recebido, intra OFSS", criadoPor: POR });

const duodecimo = (valor: string, dia: string, extra: Partial<{ ugDestinoId: string; contaDestinoId: string | null; contaOrigemId: string | null }> = {}) =>
  registrarTransferenciaEntreUgs(prisma, { tipo: "DUODECIMO", ugOrigemId: ugPref, ugDestinoId: ugCam, valor, data: D(dia), contaOrigemId: "cb-pref", contaDestinoId: "cb-cam", vinculo: `Duodécimo de ${dia.slice(5, 7)}/2026 — CF art. 29-A`, criadoPor: POR, ...extra });

async function partidasDe(lancamentoId: string | null) {
  if (lancamentoId === null) return [];
  return (await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { tipo: true, subsistema: true, valor: true, conta: { select: { codigo: true } } } }))
    .map((p) => `${p.tipo === "DEBITO" ? "D" : "C"} ${p.conta.codigo} ${p.valor.toFixed(2)} ${p.subsistema}`)
    .sort();
}

describe("V26 — o cadastro da unidade gestora", () => {
  it("o código é o do Tribunal (6 dígitos, único); a entidade presta contas por uma UG vigente de cada vez; encerrada, abre espaço", async () => {
    const base = { nome: "Fundo X", cnpj: null, naturezaJuridica: "FUNDO" as const, entidadeContabilId: null, vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR };
    await expect(cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "20100" })).rejects.toThrow(/6 dígitos/);
    await expect(cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201001" })).rejects.toThrow(/já é da unidade gestora Prefeitura Municipal/);
    await expect(cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201009", entidadeContabilId: "ent-cam" })).rejects.toThrow(/entidade 0002 já presta contas pela unidade gestora 201002/);
    await expect(cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201009", cnpj: "11.222.333/0001-80" })).rejects.toThrow(/CNPJ 11222333000180 não é válido/);
    await encerrarUnidadeGestora(prisma, { ugId: ugCam, vigenteAte: D("2026-06-30"), ato: "Resolução 1/2026", criadoPor: POR });
    await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201009", entidadeContabilId: "ent-cam", vigenteDesde: D("2026-07-01") });
    expect(await prisma.unidadeGestora.count()).toBe(3);
  });
});

describe("V26 — a contabilização decidida por tipo", () => {
  it("só conta analítica, da família da transferência e intra OFSS; cada recusa diz por quê", async () => {
    const base = { tipo: "DUODECIMO" as const, vigenteDesde: D("2026-01-01"), fundamento: "PCASP do TCE-PB 2025 (fixture do teste)", criadoPor: POR };
    await expect(definirContabilizacaoDaTransferenciaEntreUgs(prisma, { ...base, contaConcedidaCodigo: "3.5.1.1.2.00.00", contaRecebidaCodigo: "4.5.1.1.2.02.00" })).rejects.toThrow(/3\.5\.1\.1\.2\.00\.00 \(de quem concede\) é sintética/);
    await expect(definirContabilizacaoDaTransferenciaEntreUgs(prisma, { ...base, contaConcedidaCodigo: "3.5.2.1.1.00.00", contaRecebidaCodigo: "4.5.1.1.2.02.00" })).rejects.toThrow(/3\.5\.2\.1\.1\.00\.00 \(de quem concede\) não é de transferência intragovernamental/);
    await expect(definirContabilizacaoDaTransferenciaEntreUgs(prisma, { ...base, contaConcedidaCodigo: "4.5.1.1.2.02.00", contaRecebidaCodigo: "3.5.1.1.2.02.00" })).rejects.toThrow(/4\.5\.1\.1\.2\.02\.00 \(de quem concede\) não é de transferência/);
    await contabilizar();
  });

  it("sem a contabilização do tipo, a transferência é recusada nomeando o tipo, e nada é gravado", async () => {
    await expect(duodecimo("1000.00", "2026-03-10")).rejects.toThrow(/Não há contabilização decidida para duodécimo em 10\/03\/2026/);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    expect(await prisma.transferenciaEntreUgs.count()).toBe(0);
  });
});

describe("V26 — o duodécimo entre duas UGs escrituradas aqui", { timeout: 120000 }, () => {
  it("N=2: cada um gera os DOIS lados (VPD intra contra o banco; banco contra VPA intra), balanceados; a conciliação os dá como dos dois lados", async () => {
    await contabilizar();
    const m = await duodecimo("85000.00", "2026-03-10");
    const a = await duodecimo("87500.50", "2026-04-10");
    for (const [id, v] of [[m.id, "85000.00"], [a.id, "87500.50"]] as const) {
      const t = await prisma.transferenciaEntreUgs.findUniqueOrThrow({ where: { id } });
      expect(await partidasDe(t.lancamentoConcedidaId)).toEqual([`C 1.1.1.1.1.19.00 ${v} PATRIMONIAL`, `D 3.5.1.1.2.02.00 ${v} PATRIMONIAL`]);
      expect(await partidasDe(t.lancamentoRecebidaId)).toEqual([`C 4.5.1.1.2.02.00 ${v} PATRIMONIAL`, `D 1.1.1.1.1.19.00 ${v} PATRIMONIAL`]);
    }
    // Não é receita: nenhuma arrecadação nasceu.
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    const c = await conciliacaoDasTransferenciasEntreUgs(prisma, { de: D("2026-01-01"), ate: D("2026-12-31") });
    expect(c.linhas.map((l) => [l.valor, l.situacao])).toEqual([["85000.00", "DOIS_LADOS_AQUI"], ["87500.50", "DOIS_LADOS_AQUI"]]);
    expect(c.liquidoPorPar).toEqual([{ origem: "201001 Prefeitura Municipal", destino: "201002 Câmara Municipal", liquido: "172500.50" }]);
  });

  it("a conta precisa ser da entidade da UG: a conta da Câmara não serve para a Prefeitura conceder", async () => {
    await contabilizar();
    await expect(duodecimo("1000.00", "2026-03-10", { contaOrigemId: "cb-cam" })).rejects.toThrow(/conta CC-CAM não está declarada como da entidade da unidade gestora 201001 \(o titular declarado é 0002\)/);
    await prisma.contaBancaria.create({ data: { id: "cb-sem", codigo: "CC-SEM", descricao: "Sem titular", fonteId: "fnt-500", contaContabilId: "c-banco", banco: "001", agencia: "1", conta: "3", digitoConta: "3" } });
    await expect(duodecimo("1000.00", "2026-03-10", { contaOrigemId: "cb-sem" })).rejects.toThrow(/CC-SEM.*\(a conta não tem titular declarado\)/);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("o estorno inverte os dois lados, não se repete e não se estorna; o líquido do par desconta", async () => {
    await contabilizar();
    const m = await duodecimo("85000.00", "2026-03-10");
    await duodecimo("1000.00", "2026-03-11");
    const e = await estornarTransferenciaEntreUgs(prisma, { transferenciaId: m.id, data: D("2026-03-12"), motivo: "Valor lançado em duplicidade", criadoPor: POR });
    const t = await prisma.transferenciaEntreUgs.findUniqueOrThrow({ where: { id: e.id } });
    expect(await partidasDe(t.lancamentoConcedidaId)).toEqual(["C 3.5.1.1.2.02.00 85000.00 PATRIMONIAL", "D 1.1.1.1.1.19.00 85000.00 PATRIMONIAL"]);
    expect(await partidasDe(t.lancamentoRecebidaId)).toEqual(["C 1.1.1.1.1.19.00 85000.00 PATRIMONIAL", "D 4.5.1.1.2.02.00 85000.00 PATRIMONIAL"]);
    await expect(estornarTransferenciaEntreUgs(prisma, { transferenciaId: m.id, data: D("2026-03-12"), motivo: "De novo", criadoPor: POR })).rejects.toThrow(/já foi estornada/);
    await expect(estornarTransferenciaEntreUgs(prisma, { transferenciaId: e.id, data: D("2026-03-12"), motivo: "Estorno do estorno", criadoPor: POR })).rejects.toThrow(/um estorno não se estorna/);
    const c = await conciliacaoDasTransferenciasEntreUgs(prisma, { de: D("2026-03-01"), ate: D("2026-03-31") });
    expect(c.liquidoPorPar.map((x) => x.liquido)).toEqual(["1000.00"]);
  });
});

describe("V26 — quando um lado é de fora", { timeout: 120000 }, () => {
  it("só o lado daqui é escriturado; a conta do outro não entra; a conciliação diz que falta a confirmação", async () => {
    await contabilizar();
    const fora = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201077", nome: "Instituto de Previdência", cnpj: null, naturezaJuridica: "AUTARQUIA_PREVIDENCIARIA", entidadeContabilId: null, vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
    await expect(duodecimo("500.00", "2026-03-10", { ugDestinoId: fora, contaDestinoId: "cb-cam" })).rejects.toThrow(/201077 \(destino\) é de fora: a conta dela não é escriturada aqui/);
    const r = await duodecimo("500.00", "2026-03-10", { ugDestinoId: fora, contaDestinoId: null });
    const t = await prisma.transferenciaEntreUgs.findUniqueOrThrow({ where: { id: r.id } });
    expect([t.lancamentoConcedidaId !== null, t.lancamentoRecebidaId, t.contaDestinoId]).toEqual([true, null, null]);
    const c = await conciliacaoDasTransferenciasEntreUgs(prisma, { de: D("2026-03-10"), ate: D("2026-03-10") });
    expect(c.linhas.map((l) => l.situacao)).toEqual(["RECEBIMENTO_SEM_CONFIRMACAO"]);
  });

  it("nenhuma das duas escriturada aqui: recusa, não há lado a registrar", async () => {
    await contabilizar();
    const base = { cnpj: null, naturezaJuridica: "FUNDO" as const, entidadeContabilId: null, vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR };
    const a = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201081", nome: "Fundo A" })).id;
    const b = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201082", nome: "Fundo B" })).id;
    await expect(registrarTransferenciaEntreUgs(prisma, { tipo: "OUTROS_APORTES", ugOrigemId: a, ugDestinoId: b, valor: "10.00", data: D("2026-03-10"), contaOrigemId: null, contaDestinoId: null, vinculo: "Aporte", criadoPor: POR })).rejects.toThrow(/Nenhuma das duas unidades gestoras é escriturada neste sistema/);
  });
});

describe("V26 — SAGRES §4.17 e §4.18", { timeout: 120000 }, () => {
  it("cada UG manda o seu lado: a Prefeitura a concedida, a Câmara a recebida; o estorno sai com o tipo 2 no dia dele; o fim da noite é do dia civil", async () => {
    await contabilizar();
    const m = await duodecimo("85000.00", "2026-03-10");
    // 22h do dia 10 no município (01h UTC do dia 11): é do dia 10.
    await registrarTransferenciaEntreUgs(prisma, { tipo: "DUODECIMO", ugOrigemId: ugPref, ugDestinoId: ugCam, valor: "100.00", data: new Date("2026-03-11T01:00:00.000Z"), contaOrigemId: "cb-pref", contaDestinoId: "cb-cam", vinculo: "Complemento do duodécimo de março", criadoPor: POR });
    const p = { cnpjGerenciadora: CNPJ, dia: new Date(Date.UTC(2026, 2, 10)) };
    const conc = linhas((await gerarTransfConcedida(prisma, { ...p, codUnidadeGestora: "201001" })).conteudo);
    expect(conc.map((l) => [l.length, l.slice(0, 6), l.slice(6, 12), l.slice(12, 13), l.slice(13, 14), l.slice(30, 43).trim(), l.slice(43, 46), l.slice(46, 52).trim(), l.slice(67, 75)])).toEqual([
      [75, "201001", "201002", "1", "1", "111111", "001", "12345", "10032026"],
      [75, "201001", "201002", "1", "1", "111111", "001", "12345", "10032026"],
    ]);
    const rec = linhas((await gerarTransfRecebida(prisma, { ...p, codUnidadeGestora: "201002" })).conteudo);
    expect(rec.map((l) => [l.slice(0, 6), l.slice(6, 12), l.slice(30, 43).trim()])).toEqual([
      ["201002", "201001", "222222"],
      ["201002", "201001", "222222"],
    ]);
    // A Prefeitura não recebeu nada; o dia 11 está vazio.
    expect((await gerarTransfRecebida(prisma, { ...p, codUnidadeGestora: "201001" })).registros).toBe(0);
    expect((await gerarTransfConcedida(prisma, { ...p, dia: new Date(Date.UTC(2026, 2, 11)), codUnidadeGestora: "201001" })).registros).toBe(0);
    await estornarTransferenciaEntreUgs(prisma, { transferenciaId: m.id, data: D("2026-03-12"), motivo: "Valor lançado em duplicidade", criadoPor: POR });
    const est = linhas((await gerarTransfConcedida(prisma, { ...p, dia: new Date(Date.UTC(2026, 2, 12)), codUnidadeGestora: "201001" })).conteudo);
    expect(est.map((l) => [l.slice(13, 14), l.slice(67, 75)])).toEqual([["2", "12032026"]]);
  });
});
