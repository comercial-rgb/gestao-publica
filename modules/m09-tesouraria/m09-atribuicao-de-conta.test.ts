import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { importarExtrato } from "./extrato.js";
import { vincular } from "./vinculo.js";
import { atribuirContaAArrecadacao } from "./atribuicao-de-conta.js";
import { conciliacaoBancaria, ConciliacaoNaoFechaError } from "./conciliacao.js";
import { fatosDeCaixaDaConta } from "./caixa.js";

/**
 * ═══ V6 P1.2 — ARRECADAÇÃO × CONTA BANCÁRIA × CONCILIAÇÃO ═══
 * Duas contas, duas fontes; a guia declara a conta e o razão debita a contábil dela; o legado sem
 * conta fica fora da identidade e é listado; a atribuição é conferida contra o razão; N=2 na
 * concorrência; anulação e corte de período.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
const CAIXA_A = "1.1.1.1.1.19.01";
const CAIXA_B = "1.1.1.1.1.19.02";
const CAIXA_LEGADO = "1.1.1.1.1.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const NAT = "11130111";

const roteiro = (caixa: string) => roteiroArrecadacao({ disponibilidade: caixa, variacaoAumentativa: VPA, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA });

function ofx(linhas: readonly { fitid: string; dt: string; amt: string; memo: string }[]): string {
  const trns = linhas.map((l) => ["<STMTTRN>", "<TRNTYPE>OTHER", `<DTPOSTED>${l.dt}`, `<TRNAMT>${l.amt}`, `<FITID>${l.fitid}`, `<MEMO>${l.memo}`, "</STMTTRN>"].join("\n")).join("\n");
  return `OFXHEADER:100\n<OFX>\n<STMTRS>\n<CURDEF>BRL\n<BANKACCTFROM>\n<ACCTID>1\n</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>20260101\n<DTEND>20261231\n${trns}\n</BANKTRANLIST>\n</STMTRS>\n</OFX>`;
}

async function guia(p: { numero: string; fonte: "500" | "540"; valor: string; conta?: string; caixa: string; data?: string; por?: string }): Promise<string> {
  const r = await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: NAT, fonte: p.fonte, valor: p.valor, dataArrecadacao: new Date(p.data ?? "2026-01-10T12:00:00Z"), numeroReceita: p.numero, ...(p.conta !== undefined ? { contaBancaria: p.conta } : {}), criadoPor: p.por ?? POR },
    roteiro(p.caixa),
    criarM04Deps(prisma)
  );
  return r.receitaId;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-a", codigo: CAIXA_A, nome: "Banco A", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-b", codigo: CAIXA_B, nome: "Banco B", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-legado", codigo: CAIXA_LEGADO, nome: "Caixa (legado)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "A realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT, descricao: "IPTU" } });
  await prisma.fonteRecurso.createMany({ data: [{ id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" }, { id: "f540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" }] });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-a", codigo: "CC-A", descricao: "Movimento A", fonteId: "f500", contaContabilId: "c-a" },
      { id: "cb-b", codigo: "CC-B", descricao: "FUNDEB B", fonteId: "f540", contaContabilId: "c-b" },
      { id: "cb-sem", codigo: "CC-SEM", descricao: "Sem mapa", fonteId: "f500" },
    ],
  });
  const perfil = await prisma.perfil.create({ data: { nome: "SEM_PODERES", descricao: "nada", criadoPor: POR }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

// ⚠️ O CORTE É "AGORA": o vínculo também respeita o corte (um vínculo feito depois não explica
// retroativamente), e os vínculos deste teste nascem no relógio real. A guia "depois do corte" é
// datada no fim do exercício, adiante do relógio desta máquina.
const CORTE = new Date(Date.now() + 60_000);

describe("V6 P1.2 · arrecadação × conta bancária × conciliação", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a guia que declara a conta exige fonte igual e a contábil da conta como perna de disponibilidade — nada é gravado na recusa", async () => {
    // ⚠️ ESTA ASERÇÃO ESTAVA VERMELHA DESDE A V16, e a causa é boa de registrar: ela afirmava a
    // mensagem de ANTES da conta multifonte ("a conta é da fonte 540, e a guia é da fonte 500").
    // Quando a arrecadação passou a consultar o ROL da conta (`exigirFonteNoRol`), a recusa passou a
    // dizer quais fontes a conta COMPORTA — e ninguém rodou este arquivo desde então. Agora ela
    // afirma o motivo que de fato sobe, que é o que um teste de negação tem de fazer.
    await expect(
      guia({ numero: "G1", fonte: "500", valor: "100.00", conta: "CC-B", caixa: CAIXA_B })
    ).rejects.toThrow(/FONTE FORA DO ROL.*permitidas nesta conta são: 540.*Nada foi gravado/s);
    await expect(guia({ numero: "G2", fonte: "500", valor: "100.00", conta: "CC-A", caixa: CAIXA_LEGADO })).rejects.toThrow(/ESCRITURAÇÃO INCOERENTE.*roteiro debita 1\.1\.1\.1\.1\.00\.00/);
    await expect(guia({ numero: "G3", fonte: "500", valor: "100.00", conta: "CC-SEM", caixa: CAIXA_A })).rejects.toThrow(/não tem conta contábil mapeada/);
    await expect(guia({ numero: "G4", fonte: "500", valor: "100.00", conta: "CC-X", caixa: CAIXA_A })).rejects.toThrow(/não cadastrada/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    const ok = await guia({ numero: "G5", fonte: "500", valor: "100.00", conta: "CC-A", caixa: CAIXA_A });
    expect((await prisma.receitaArrecadada.findUniqueOrThrow({ where: { id: ok }, select: { contaBancariaId: true } })).contaBancariaId).toBe("cb-a");
  });

  it("t2 (duas contas, duas fontes): cada conciliação só enxerga as guias da SUA conta, e fecha", async () => {
    const a1 = await guia({ numero: "A1", fonte: "500", valor: "2000.00", conta: "CC-A", caixa: CAIXA_A });
    const b1 = await guia({ numero: "B1", fonte: "540", valor: "300.00", conta: "CC-B", caixa: CAIXA_B });
    await importarExtrato(prisma, { contaBancariaId: "cb-a", importadoPor: POR, arquivoOfx: ofx([{ fitid: "A-C1", dt: "20260110", amt: "2000.00", memo: "IPTU" }]) });
    await importarExtrato(prisma, { contaBancariaId: "cb-b", importadoPor: POR, arquivoOfx: ofx([{ fitid: "B-C1", dt: "20260110", amt: "300.00", memo: "FUNDEB" }]) });
    const fatosA = await fatosDeCaixaDaConta(prisma, { id: "cb-a", codigo: "CC-A", fonteId: "f500", contaContabilId: "c-a" }, CORTE);
    const fatosB = await fatosDeCaixaDaConta(prisma, { id: "cb-b", codigo: "CC-B", fonteId: "f540", contaContabilId: "c-b" }, CORTE);
    expect(fatosA.map((f) => f.id)).toEqual([a1]);
    expect(fatosB.map((f) => f.id)).toEqual([b1]);
    // vincular a guia de A à linha de B é recusado: a guia diz em que conta entrou
    const linhaB = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "B-C1" } });
    await expect(vincular(prisma, { lancamentoExtratoId: linhaB.id, tipoInterno: "ARRECADACAO", internoId: a1, valor: "300.00", criadoPor: POR })).rejects.toThrow(/conta/i);
    const linhaA = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "A-C1" } });
    await vincular(prisma, { lancamentoExtratoId: linhaA.id, tipoInterno: "ARRECADACAO", internoId: a1, valor: "2000.00", criadoPor: POR });
    await vincular(prisma, { lancamentoExtratoId: linhaB.id, tipoInterno: "ARRECADACAO", internoId: b1, valor: "300.00", criadoPor: POR });
    const rA = await conciliacaoBancaria(prisma, "cb-a", CORTE);
    const rB = await conciliacaoBancaria(prisma, "cb-b", CORTE);
    expect(rA.diferenca).toBe("0.00");
    expect(rA.internoSemVinculo).toHaveLength(0);
    expect(rA.arrecadacoesSemConta).toHaveLength(0);
    expect(rB.diferenca).toBe("0.00");
  });

  it("t3 (legado): a guia sem conta fica FORA da identidade e é listada; vincular sem atribuir é recusado; a atribuição conferida contra o razão a traz para dentro", async () => {
    // A guia do legado debitou a contábil de CC-A (o razão está certo; só falta dizer a conta).
    const legado = await guia({ numero: "L1", fonte: "500", valor: "500.00", caixa: CAIXA_A });
    await importarExtrato(prisma, { contaBancariaId: "cb-a", importadoPor: POR, arquivoOfx: ofx([{ fitid: "A-L1", dt: "20260110", amt: "500.00", memo: "DEPOSITO" }]) });
    // O razão tem +500 na contábil de A; o lado interno não tem a guia → a identidade NÃO fecha, e o erro lista a guia.
    let erro: unknown = null;
    try {
      await conciliacaoBancaria(prisma, "cb-a", CORTE);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ConciliacaoNaoFechaError);
    expect((erro as ConciliacaoNaoFechaError).arrecadacoesSemConta.map((g) => [g.numeroReceita, g.contaContabilDebitada])).toEqual([["L1", CAIXA_A]]);
    expect(String(erro)).toMatch(/SEM conta bancária declarada/);
    const linha = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "A-L1" } });
    await expect(vincular(prisma, { lancamentoExtratoId: linha.id, tipoInterno: "ARRECADACAO", internoId: legado, valor: "500.00", criadoPor: POR })).rejects.toThrow(/Atribua a conta/);

    // Atribuir à conta ERRADA (contábil diferente) é recusado nomeando o razão.
    await expect(atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-b", motivo: "tentativa errada", criadoPor: POR })).rejects.toThrow(/fonte 500.*fonte 540/);
    const legado2 = await guia({ numero: "L2", fonte: "500", valor: "10.00", caixa: CAIXA_LEGADO });
    await expect(atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado2, contaBancariaId: "cb-a", motivo: "razão em outra conta", criadoPor: POR })).rejects.toThrow(/ESCRITURAÇÃO NÃO CONFERE.*debitou 1\.1\.1\.1\.1\.00\.00/);
    // Sem a ação, recusa nomeando.
    await expect(atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-a", motivo: "sem poder", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/ATRIBUIR_CONTA_A_ARRECADACAO/);
    expect(await prisma.atribuicaoDeContaDaArrecadacao.count()).toBe(0);

    // A atribuição certa: entra no lado interno, o vínculo passa e a conciliação fecha.
    await atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-a", motivo: "guia importada antes da conta obrigatória", criadoPor: POR });
    await expect(atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-a", motivo: "de novo", criadoPor: POR })).rejects.toThrow(/já foi atribuída/);
    await vincular(prisma, { lancamentoExtratoId: linha.id, tipoInterno: "ARRECADACAO", internoId: legado, valor: "500.00", criadoPor: POR });
    const r = await conciliacaoBancaria(prisma, "cb-a", CORTE);
    expect(r.diferenca).toBe("0.00");
    expect(r.internoSemVinculo).toHaveLength(0);
    // L2 continua listada como legado (debitou OUTRA contábil): identificada, nunca casada — e a
    // identidade fecha sem ela, porque ela não está em lado nenhum desta conta.
    expect(r.arrecadacoesSemConta.map((g) => [g.numeroReceita, g.contaContabilDebitada])).toEqual([["L2", CAIXA_LEGADO]]);
  });

  it("t4 (N=2): duas atribuições concorrentes da mesma guia — exatamente uma passa", async () => {
    const legado = await guia({ numero: "L3", fonte: "500", valor: "500.00", caixa: CAIXA_A });
    const r = await Promise.allSettled([
      atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-a", motivo: "primeira", criadoPor: POR }),
      atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legado, contaBancariaId: "cb-a", motivo: "segunda", criadoPor: POR }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const falha = r.find((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(String(falha?.reason)).toMatch(/CONCORRÊNCIA|já foi atribuída/);
    expect(await prisma.atribuicaoDeContaDaArrecadacao.count()).toBe(1);
  });

  it("t5: anulação copia a conta e tira a guia dos dois lados; guia depois do corte fica fora; guia anulada não recebe atribuição", async () => {
    const a1 = await guia({ numero: "A1", fonte: "500", valor: "2000.00", conta: "CC-A", caixa: CAIXA_A });
    await anularArrecadacao({ receitaId: a1, numeroReceita: "A1-ANUL", dataAnulacao: new Date("2026-01-12T12:00:00Z"), criadoPor: POR }, criarM04Deps(prisma));
    const anulacao = await prisma.receitaArrecadada.findFirstOrThrow({ where: { estornoDeId: a1 }, select: { contaBancariaId: true } });
    expect(anulacao.contaBancariaId).toBe("cb-a");
    const depois = await guia({ numero: "A2", fonte: "500", valor: "50.00", conta: "CC-A", caixa: CAIXA_A, data: "2026-12-31T12:00:00Z" });
    const fatos = await fatosDeCaixaDaConta(prisma, { id: "cb-a", codigo: "CC-A", fonteId: "f500", contaContabilId: "c-a" }, CORTE);
    expect(fatos.map((f) => f.id)).not.toContain(a1);
    expect(fatos.map((f) => f.id)).not.toContain(depois);
    const r = await conciliacaoBancaria(prisma, "cb-a", CORTE);
    expect(r.diferenca).toBe("0.00");
    const legadoAnulado = await guia({ numero: "L9", fonte: "500", valor: "1.00", caixa: CAIXA_A });
    await anularArrecadacao({ receitaId: legadoAnulado, numeroReceita: "L9-ANUL", dataAnulacao: new Date("2026-01-12T12:00:00Z"), criadoPor: POR }, criarM04Deps(prisma));
    await expect(atribuirContaAArrecadacao(prisma, { receitaArrecadadaId: legadoAnulado, contaBancariaId: "cb-a", motivo: "anulada", criadoPor: POR })).rejects.toThrow(/ANULADA/);
    expect((await conciliacaoBancaria(prisma, "cb-a", CORTE)).arrecadacoesSemConta).toHaveLength(0);
  });
});
