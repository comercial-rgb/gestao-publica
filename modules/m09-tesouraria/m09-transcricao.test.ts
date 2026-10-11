import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { travar } from "../../packages/locks/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { lerFatosSaldoMensal } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";
import { importarExtrato } from "./extrato.js";
import { estornarVinculo, vincular } from "./vinculo.js";
import { conciliacaoBancaria } from "./conciliacao.js";
import { revisarTranscricaoDeExtrato, transcreverLinhasDeExtrato } from "./transcricao.js";

/**
 * V39-R3 (R3-015, V39-029) — A LINHA DE EXTRATO DIGITADA.
 *
 * O que se afirma é o EFEITO em quem lê o extrato — o saldo da conciliação, o vínculo e o saldo mensal ao tribunal —, e
 * não a presença de um filtro. Os valores esperados são aritmética manual, escrita como literal:
 *   L1 DEBITO 300,00 em 05/03 (o pagamento P), L2 CREDITO 50,00 em 06/03.
 *   sem revisão ............................ saldo do extrato 0,00
 *   L1 confirmada, L2 divergente ............ −300,00
 *   L1 e L2 confirmadas ..................... −250,00
 *   banco cobre 06/03 com B1 CREDITO 60,00 .. −300 + 60 = −240,00 (L2 sai; com ela seria −190,00)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const DIGITA = "tesouraria@cg.pb.gov.br";
const REVISA = "contabilidade@cg.pb.gov.br";
const SO_CONSULTA = "consulta.financeiro@cg.pb.gov.br";
const FONTE = "fnt-500";
const CONTA = "cb1";
const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const conta = (id: string, codigo: string, nat: "DEVEDORA" | "CREDORA") => ({ id, codigo, nome: codigo, naturezaSaldo: nat, nivel: 5, analitica: true });
const CONTAS = [
  conta("c-caixa", CAIXA, "DEVEDORA"), conta("c-forn", FORNECEDOR, "CREDORA"), conta("c-vpd", VPD, "DEVEDORA"),
  conta("c-disp", C_DISPONIVEL, "CREDORA"), conta("c-emp", C_EMPENHADO, "CREDORA"), conta("c-liq", C_LIQUIDADO, "CREDORA"), conta("c-pago", C_PAGO, "CREDORA"),
];
const CORTE = new Date("2026-03-31T15:00:00Z");
const DOCUMENTO = "Extrato impresso entregue pela agência em 10/03/2026";

let P = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  const deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: CONTA, codigo: "CC-001", descricao: "Movimento", fonteId: FONTE, contaContabilId: "c-caixa", banco: "001", agencia: "1234", conta: "56789" } });
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "10000.00" });
  const e = await empenhar({ fichaId: "ficha-1", numero: "NE-1", tipo: "ORDINARIO", valor: "300.00", data: new Date("2026-03-02T12:00:00Z"), credorCpfCnpj: "12345678000195", historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: DIGITA }, roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO }), deps);
  const l = await liquidar({ empenhoId: e.empenhoId, numero: "NL-1", valor: "300.00", data: new Date("2026-03-03T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liq", criadoPor: DIGITA }, roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO }), deps);
  P = (await pagar({ liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "300.00", data: new Date("2026-03-05T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pgto", criadoPor: DIGITA }, roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO }), deps)).pagamentoId;
  const u = await prisma.usuario.create({ data: { identificador: SO_CONSULTA, nome: SO_CONSULTA, criadoPor: "TESTE" }, select: { id: true } });
  const pf = await prisma.perfil.create({ data: { nome: "SO-CONSULTA-FINANCEIRO", descricao: "perfil do teste", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_FINANCEIRO", unidadeOrcId: null, criadoPor: "TESTE" }] } }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: pf.id, criadoPor: "TESTE" } });
}

const transcrever = (linhas: { data: string; valor: string; natureza: "CREDITO" | "DEBITO"; historico: string }[], o: { criadoPor?: string; confirmoLinhasRepetidas?: boolean } = {}) =>
  transcreverLinhasDeExtrato(prisma, { contaBancariaId: CONTA, linhas, documentoDeSuporte: DOCUMENTO, criadoPor: o.criadoPor ?? DIGITA, confirmoLinhasRepetidas: o.confirmoLinhasRepetidas ?? false });
const L1 = { data: "2026-03-05", valor: "300.00", natureza: "DEBITO" as const, historico: "PAGAMENTO FORNECEDOR NP-1" };
const L2 = { data: "2026-03-06", valor: "50.00", natureza: "CREDITO" as const, historico: "DEPOSITO" };
const transcricaoDe = async (historico: string) =>
  (await prisma.transcricaoDeLinhaDeExtrato.findFirstOrThrow({ where: { lancamentoExtrato: { memo: historico } }, select: { id: true, lancamentoExtratoId: true } }));
// O conhecimento é AGORA: as revisões do teste são gravadas hoje, depois do corte (a data do conhecimento é o caso da prova abaixo).
const saldoDoExtrato = async () => (await conciliacaoBancaria(prisma, CONTA, CORTE, { conhecimento: new Date() })).saldoExtrato;
const saldoMensal = async () => (await lerFatosSaldoMensal(prisma, { codUnidadeGestora: "201001", cnpjGerenciadora: "00000000000191", competencia: new Date("2026-03-15T12:00:00Z") }))[0]!.valor.toFixed(2);

function ofx(inicio: string, fim: string, linhas: readonly { fitid: string; dt: string; amt: string; memo: string }[]): string {
  const trns = linhas.map((l) => ["<STMTTRN>", "<TRNTYPE>OTHER", `<DTPOSTED>${l.dt}`, `<TRNAMT>${l.amt}`, `<FITID>${l.fitid}`, `<MEMO>${l.memo}`, "</STMTTRN>"].join("\n")).join("\n");
  return `OFXHEADER:100\n<OFX>\n<STMTRS>\n<CURDEF>BRL\n<BANKACCTFROM>\n<ACCTID>56789\n</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>${inicio}\n<DTEND>${fim}\n${trns}\n</BANKTRANLIST>\n</STMTRS>\n</OFX>`;
}

describe("V39-R3 — linha de extrato digitada: entra pela transcrição, só vale revisada e confirmada", { timeout: 60000 }, () => {
  beforeEach(semear, 60000);
  afterAll(async () => prisma.$disconnect());

  it("N=2 linhas digitadas, sem revisão: nenhuma entra no saldo do extrato nem no saldo mensal, e não concilia (motivo)", async () => {
    const r = await transcrever([L1, L2]);
    expect(r.linhas).toBe(2);
    const extrato = await prisma.extratoBancario.findUniqueOrThrow({ where: { id: r.extratoId }, select: { origem: true, importadoPor: true } });
    expect([extrato.origem, extrato.importadoPor]).toEqual(["DIGITADO", DIGITA]);
    expect((await prisma.transcricaoDeLinhaDeExtrato.findMany({ select: { documentoDeSuporte: true, criadoPor: true } })).map((t) => [t.documentoDeSuporte, t.criadoPor])).toEqual([[DOCUMENTO, DIGITA], [DOCUMENTO, DIGITA]]);
    expect(await saldoDoExtrato()).toBe("0.00");
    expect(await saldoMensal()).toBe("0.00");
    const t1 = await transcricaoDe(L1.historico);
    await expect(vincular(prisma, { lancamentoExtratoId: t1.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "300.00", criadoPor: DIGITA }))
      .rejects.toThrow(/não pode ser conciliada: digitada e ainda não revisada por outra pessoa/);
    expect(await prisma.vinculoConciliacao.count()).toBe(0);
  });

  it("revisão por outra pessoa: a confirmada vale (saldo, saldo mensal, vínculo); a divergente nunca vale; uma revisão só", async () => {
    await transcrever([L1, L2]);
    const t1 = await transcricaoDe(L1.historico);
    const t2 = await transcricaoDe(L2.historico);
    await expect(revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "CONFIRMADA", meio: "Extrato impresso", criadoPor: DIGITA }))
      .rejects.toThrow(/Quem digitou a linha não a revisa/);
    await revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "CONFIRMADA", meio: "Conferida contra o extrato impresso", criadoPor: REVISA });
    await revisarTranscricaoDeExtrato(prisma, { transcricaoId: t2.id, resultado: "DIVERGENTE", meio: "O impresso diz 55,00", criadoPor: REVISA });
    await expect(revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "DIVERGENTE", meio: "de novo", criadoPor: REVISA }))
      .rejects.toThrow(/já foi revisada \(confirmada, por contabilidade@cg\.pb\.gov\.br\)/);
    expect(await saldoDoExtrato()).toBe("-300.00");
    expect(await saldoMensal()).toBe("-300.00");
    await vincular(prisma, { lancamentoExtratoId: t1.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "300.00", criadoPor: DIGITA });
    await expect(vincular(prisma, { lancamentoExtratoId: t2.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "50.00", criadoPor: DIGITA }))
      .rejects.toThrow(/revisada e considerada divergente do documento/);
    expect(await prisma.revisaoDaTranscricaoDeExtrato.count()).toBe(2);
  });

  it("o extrato do banco substitui a transcrição dos dias que cobre; com a linha digitada conciliada, a importação é recusada até o vínculo ser estornado", async () => {
    await transcrever([L1, L2]);
    for (const h of [L1.historico, L2.historico]) await revisarTranscricaoDeExtrato(prisma, { transcricaoId: (await transcricaoDe(h)).id, resultado: "CONFIRMADA", meio: "Extrato impresso", criadoPor: REVISA });
    expect(await saldoDoExtrato()).toBe("-250.00");
    const t1 = await transcricaoDe(L1.historico);
    const v = await vincular(prisma, { lancamentoExtratoId: t1.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "300.00", criadoPor: DIGITA });

    // O banco cobre 06/03: L2 (não conciliada) sai, B1 entra.
    await importarExtrato(prisma, { contaBancariaId: CONTA, arquivoOfx: ofx("20260306", "20260306", [{ fitid: "B1", dt: "20260306", amt: "60.00", memo: "DEPOSITO" }]), importadoPor: DIGITA });
    expect(await saldoDoExtrato()).toBe("-240.00");
    await expect(transcrever([{ ...L2, valor: "70.00", historico: "OUTRO DEPOSITO" }])).rejects.toThrow(/06\/03\/2026 da conta CC-001 já está coberto pelo extrato do banco/);

    // O banco cobre 05/03, onde L1 está conciliada: recusa, nomeando, e nada entra.
    const arquivo05 = ofx("20260305", "20260305", [{ fitid: "B2", dt: "20260305", amt: "-300.00", memo: "PAGAMENTO" }]);
    await expect(importarExtrato(prisma, { contaBancariaId: CONTA, arquivoOfx: arquivo05, importadoPor: DIGITA }))
      .rejects.toThrow(/linha digitada já conciliada \(R\$ 300,00, "PAGAMENTO FORNECEDOR NP-1"\)\. Estorne o vínculo/);
    expect(await prisma.lancamentoExtrato.count({ where: { fitid: "B2" } })).toBe(0);
    await estornarVinculo(prisma, { vinculoId: v.vinculoId, motivo: "A linha do banco substitui a digitada.", criadoPor: DIGITA });
    await importarExtrato(prisma, { contaBancariaId: CONTA, arquivoOfx: arquivo05, importadoPor: DIGITA });
    // B2 (−300) + B1 (+60); L1 e L2, cobertas, fora.
    expect(await saldoDoExtrato()).toBe("-240.00");
    expect(await saldoMensal()).toBe("-240.00");
    await expect(vincular(prisma, { lancamentoExtratoId: t1.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "300.00", criadoPor: DIGITA }))
      .rejects.toThrow(/o dia dela já está coberto pelo extrato do banco/);
  });

  it("recusas com o motivo, sem gravar: sem permissão, dia futuro, linha repetida sem a declaração, documento vazio", async () => {
    await expect(transcrever([L1], { criadoPor: SO_CONSULTA })).rejects.toThrow(/não tem permissão para TRANSCREVER_EXTRATO/);
    await expect(transcrever([{ ...L1, data: "2099-01-01" }])).rejects.toThrow(/ainda não chegou/);
    await expect(transcrever([L1, L1])).rejects.toThrow(/Há duas linhas iguais neste lançamento/);
    await expect(transcreverLinhasDeExtrato(prisma, { contaBancariaId: CONTA, linhas: [L1], documentoDeSuporte: "  ", criadoPor: DIGITA })).rejects.toThrow(/Informe o documento de onde as linhas foram copiadas/);
    expect(await prisma.lancamentoExtrato.count()).toBe(0);
    await transcrever([L1]);
    await expect(transcrever([L1])).rejects.toThrow(/Já existe uma linha digitada igual na conta CC-001/);
    // Duas tarifas iguais no mesmo dia existem: com a declaração, passa.
    await transcrever([L1], { confirmoLinhasRepetidas: true });
    expect(await prisma.lancamentoExtrato.count()).toBe(2);
  });
  it("a conta travada por outra transação: vincular linha digitada e importar o extrato do banco esperam (sem isso, a guarda de um não via o outro)", async () => {
    await transcrever([L1]);
    const t1 = await transcricaoDe(L1.historico);
    await revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "CONFIRMADA", meio: "Extrato impresso", criadoPor: REVISA });
    const segurar = async (): Promise<{ liberar: () => void; segurando: Promise<void> }> => {
      let liberar: () => void = () => undefined;
      const presa = new Promise<void>((x) => { liberar = x; });
      let travado: () => void = () => undefined;
      const jaTravou = new Promise<void>((x) => { travado = x; });
      const segurando = prisma.$transaction(async (tx) => { await travar(tx, "ContaBancaria", [CONTA]); travado(); await presa; }, { timeout: 20_000 });
      await jaTravou;
      return { liberar, segurando };
    };
    // A trava se solta no finally: um expect que falha não deixa a conta presa para o teste seguinte.
    const a = await segurar();
    let vinculou = false;
    const v = vincular(prisma, { lancamentoExtratoId: t1.lancamentoExtratoId, tipoInterno: "PAGAMENTO", internoId: P, valor: "300.00", criadoPor: DIGITA }).then(() => { vinculou = true; });
    let vinculouCedo = true;
    try {
      await new Promise((x) => setTimeout(x, 800));
      vinculouCedo = vinculou;
    } finally {
      a.liberar();
      await a.segurando;
      await v;
    }
    const b = await segurar();
    let importou = false;
    const i = importarExtrato(prisma, { contaBancariaId: CONTA, arquivoOfx: ofx("20260306", "20260306", [{ fitid: "B9", dt: "20260306", amt: "10.00", memo: "X" }]), importadoPor: DIGITA }).then(() => { importou = true; });
    let importouCedo = true;
    try {
      await new Promise((x) => setTimeout(x, 800));
      importouCedo = importou;
    } finally {
      b.liberar();
      await b.segurando;
      await i;
    }
    expect([vinculouCedo, importouCedo]).toEqual([false, false]);
    expect([vinculou, importou]).toEqual([true, true]);
  });

  it("como estava na data do conhecimento: a confirmação gravada depois não muda a conciliação daquela data", async () => {
    await transcrever([L1]);
    const t1 = await transcricaoDe(L1.historico);
    const antesDaRevisao = new Date();
    await new Promise((x) => setTimeout(x, 20));
    await revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "CONFIRMADA", meio: "Extrato impresso", criadoPor: REVISA });
    expect((await conciliacaoBancaria(prisma, CONTA, CORTE, { conhecimento: antesDaRevisao })).saldoExtrato).toBe("0.00");
    expect(await saldoDoExtrato()).toBe("-300.00");
  });

  it("dia que não existe e dia que ainda não chegou no fuso do ente (23h30 de 09/03 já é 10/03 em UTC) são recusados", async () => {
    await expect(transcrever([{ ...L1, data: "2026-02-30" }])).rejects.toThrow(/o dia 30\/02\/2026 não existe/);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-03-10T02:30:00Z"));
      await expect(transcrever([{ ...L1, data: "2026-03-10" }])).rejects.toThrow(/10\/03\/2026 ainda não chegou/);
      await transcrever([{ ...L1, data: "2026-03-09" }]);
    } finally {
      vi.useRealTimers();
    }
    expect(await prisma.lancamentoExtrato.count()).toBe(1);
  });

  it("revisar sem a permissão é recusado com o motivo", async () => {
    await transcrever([L1]);
    const t1 = await transcricaoDe(L1.historico);
    await expect(revisarTranscricaoDeExtrato(prisma, { transcricaoId: t1.id, resultado: "CONFIRMADA", meio: "Extrato impresso", criadoPor: SO_CONSULTA }))
      .rejects.toThrow(/não tem permissão para TRANSCREVER_EXTRATO/);
    expect(await prisma.revisaoDaTranscricaoDeExtrato.count()).toBe(0);
  });
});
