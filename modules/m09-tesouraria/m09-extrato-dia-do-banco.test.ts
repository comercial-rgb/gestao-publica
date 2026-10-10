import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { diaCivil } from "../../packages/datas/index.js";
import { importarExtrato } from "./extrato.js";
import { abrirConciliacao, lerConciliacao } from "./servico-conciliacao.js";
import { conciliacaoBancaria } from "./conciliacao.js";
import { instanteDoDiaDoBanco, janelaDoBancoDoAno, limiteDoBancoApos } from "./dia-do-banco.js";

/**
 * V38 (achado no AUD-050) — O DIA DO BANCO NA CONCILIAÇÃO.
 *
 * Os leitores guardam o dia do extrato em UTC (formato externo): o de OFX à MEIA-NOITE, o da API do BB ao MEIO-DIA. O
 * resto da conciliação fala em dia CIVIL do ente (UTC−3): o fim do período é o fim do dia civil; a tela formata no fuso
 * do ente. Medido na base de demonstração: a linha do dia 01/07 aparecia como 30/06, e a do dia seguinte ao fim do
 * período entrava nele.
 *
 * Fixture N=2 na BORDA (uma linha no ÚLTIMO dia do período e outra no PRIMEIRO do seguinte), e as DUAS âncoras no
 * último dia. Com uma linha só, "entra tudo" e "entra o certo" coincidiriam.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const fitid = (descricao: string): string => /FITID (\w+)/.exec(descricao)?.[1] ?? "";

function ofx(linhas: readonly { fitid: string; dt: string; amt: string }[]): string {
  const trns = linhas.map((l) => ["<STMTTRN>", "<TRNTYPE>OTHER", `<DTPOSTED>${l.dt}`, `<TRNAMT>${l.amt}`, `<FITID>${l.fitid}`, `<MEMO>LINHA ${l.fitid}`, "</STMTTRN>"].join("\n")).join("\n");
  return `OFXHEADER:100
<OFX>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>001
<ACCTID>99999-9
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601
<DTEND>20260731
${trns}
</BANKTRANLIST>
</STMTRS>
</OFX>`;
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({ data: { id: "cp-bancos", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  await prisma.contaBancaria.create({ data: { id: "cb-dia", codigo: "CC-DIA", descricao: "Movimento", fonteId: "fnt-500", contaContabilId: "cp-bancos", banco: "001" } });
  await prisma.fonteDaContaBancaria.create({ data: { contaBancariaId: "cb-dia", fonteId: "fnt-500", criadoPor: POR } });
  await importarExtrato(prisma, {
    contaBancariaId: "cb-dia",
    arquivoOfx: ofx([
      { fitid: "JUN30", dt: "20260630120000[-3:BRT]", amt: "100.00" },
      { fitid: "JUL01", dt: "20260701", amt: "50.00" },
    ]),
    importadoPor: POR,
  });
  // A âncora do leitor da API do BB é MEIO-DIA UTC (`m17-banco-bb/normalizar.ts`): uma linha de 30/06 por esse caminho
  // tem de entrar em junho também (achado do auditor: com "<= meia-noite do dia" ela ficava de fora).
  const extrato = await prisma.extratoBancario.findFirstOrThrow({ select: { id: true } });
  await prisma.lancamentoExtrato.create({
    data: { extratoId: extrato.id, contaBancariaId: "cb-dia", fitid: "BB30", dataPostagem: new Date("2026-06-30T12:00:00Z"), valor: "7.00", natureza: "CREDITO", memo: "LINHA BB30", linhaHash: "bb30" },
  });
}, 60_000);

describe("V38 — o dia do banco na conciliação", () => {
  it("a conciliação de junho leva as linhas de 30/06 (nas duas âncoras) e NÃO a de 01/07", async () => {
    const { conciliacaoId } = await abrirConciliacao(prisma, { contaBancariaId: "cb-dia", diaInicio: "2026-06-01", diaFim: "2026-06-30", criadoPor: POR });
    const junho = await lerConciliacao(prisma, conciliacaoId);
    expect(junho.relatorio.saldoExtrato).toBe("107.00");
    expect(junho.relatorio.noExtratoSemVinculo.map((l) => fitid(l.descricao)).sort()).toEqual(["BB30", "JUN30"]);
  });

  it("cada linha se mostra no dia que o banco informou, no fuso do ente", async () => {
    const r = await conciliacaoBancaria(prisma, "cb-dia", new Date("2026-07-31T23:00:00Z"));
    const dias = Object.fromEntries(r.noExtratoSemVinculo.map((l) => [fitid(l.descricao), diaCivil(l.data)]));
    expect(dias).toEqual({ BB30: "2026-06-30", JUN30: "2026-06-30", JUL01: "2026-07-01" });
  });

  it("as réguas puras valem nas duas âncoras e na virada do ano", () => {
    const corte = new Date("2026-07-01T02:59:59.999Z"); // fim do dia civil 30/06 no ente (UTC−3)
    const limite = limiteDoBancoApos(corte);
    expect([new Date("2026-06-30T00:00:00Z") < limite, new Date("2026-06-30T12:00:00Z") < limite, new Date("2026-07-01T00:00:00Z") < limite]).toEqual([true, true, false]);
    expect(diaCivil(instanteDoDiaDoBanco(new Date("2026-06-30T00:00:00Z")))).toBe("2026-06-30");
    expect(diaCivil(instanteDoDiaDoBanco(new Date("2026-06-30T12:00:00Z")))).toBe("2026-06-30");
    const ano = janelaDoBancoDoAno(2026);
    const dentro = (d: Date): boolean => d >= ano.inicio && d < ano.limite;
    expect([dentro(new Date("2026-01-01T00:00:00Z")), dentro(new Date("2026-12-31T12:00:00Z")), dentro(new Date("2027-01-01T00:00:00Z"))]).toEqual([true, true, false]);
  });
});
