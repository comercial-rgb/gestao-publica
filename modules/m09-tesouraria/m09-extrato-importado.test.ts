import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarExtrato } from "./extrato.js";
import { lerExtratoImportado } from "./extrato-importado.js";

/**
 * V36 — O EXTRATO IMPORTADO PARA CONSULTA E IMPRESSÃO. N=2 em tudo que soma: dois créditos e dois débitos, duas
 * linhas no mesmo dia (a ordem natural do FITID decide: "7" antes de "10"), um vínculo parcial e um vínculo estornado
 * (que volta a deixar a linha pendente).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "tesouraria@cg.pb.gov.br";

const CABECALHO = "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n";

function trn(tipo: "CREDIT" | "DEBIT", dia: string, valor: string, fitid: string, memo: string): string {
  return `<STMTTRN>
<TRNTYPE>${tipo}</TRNTYPE>
<DTPOSTED>202603${dia}000000[-3:GMT]</DTPOSTED>
<TRNAMT>${tipo === "DEBIT" ? "-" : ""}${valor}</TRNAMT>
<FITID>${fitid}</FITID>
<MEMO>${memo}</MEMO>
</STMTTRN>`;
}

const ARQUIVO = `${CABECALHO}<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM>
<BANKID>748</BANKID>
<ACCTID>0101990000123456</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260301000000[-3:GMT]</DTSTART>
<DTEND>20260331000000[-3:GMT]</DTEND>
${trn("DEBIT", "20", "12.50", "30", "TARIFA")}
${trn("CREDIT", "05", "1000.10", "10", "FPM")}
${trn("CREDIT", "05", "250.25", "7", "ICMS")}
${trn("DEBIT", "12", "300.00", "20", "PAGAMENTO FORNECEDOR")}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>937.85</BALAMT>
<DTASOF>20260331000000[-3:GMT]</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

async function semear(): Promise<string> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb-s", codigo: "CC-SICREDI", descricao: "Sicredi", fonteId: "fnt-500", banco: "748" } });
  await importarExtrato(prisma, { contaBancariaId: "cb-s", arquivoOfx: ARQUIVO, importadoPor: POR });
  return (await prisma.extratoBancario.findFirstOrThrow({ select: { id: true } })).id;
}

async function vincular(fitid: string, valor: string): Promise<string> {
  const l = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid }, select: { id: true } });
  const v = await prisma.vinculoConciliacao.create({
    data: { lancamentoExtratoId: l.id, tipoInterno: "MOVIMENTO_BANCARIO", internoId: `mov-${fitid}`, valor, tipo: "VINCULO", criadoPor: POR },
    select: { id: true },
  });
  return v.id;
}

describe("M09 V36 — o extrato importado, para impressão", () => {
  let extratoId = "";
  beforeEach(async () => {
    extratoId = await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: as linhas na ordem do banco (data, depois FITID em ordem natural) e os totais do arquivo", async () => {
    const e = await lerExtratoImportado(prisma, extratoId);
    expect(e).not.toBeNull();
    expect(e!.linhas.map((l) => [l.fitid, l.natureza, l.valor.toFixed(2), l.memo])).toEqual([
      ["7", "CREDITO", "250.25", "ICMS"],
      ["10", "CREDITO", "1000.10", "FPM"],
      ["20", "DEBITO", "300.00", "PAGAMENTO FORNECEDOR"],
      ["30", "DEBITO", "12.50", "TARIFA"],
    ]);
    expect(e!.totalCreditos.toFixed(2)).toBe("1250.35");
    expect(e!.totalDebitos.toFixed(2)).toBe("312.50");
    expect(e!.movimentoLiquido.toFixed(2)).toBe("937.85");
    expect([e!.bancoDoArquivo, e!.contaDoArquivo]).toEqual(["748", "0101990000123456"]);
  });

  it("t2: a situação vem dos vínculos vivos — inteira, parcial, estornada volta a pendente", async () => {
    await vincular("10", "1000.10");
    await vincular("20", "100.00");
    const original = await vincular("30", "12.50");
    const l30 = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "30" }, select: { id: true } });
    await prisma.vinculoConciliacao.create({
      data: { lancamentoExtratoId: l30.id, tipoInterno: "MOVIMENTO_BANCARIO", internoId: "mov-30", valor: "12.50", tipo: "ESTORNO_VINCULO", estornoDeId: original, motivo: "vínculo errado", criadoPor: POR },
    });
    const e = await lerExtratoImportado(prisma, extratoId);
    expect(e!.linhas.map((l) => [l.fitid, l.situacao, l.vinculado.toFixed(2)])).toEqual([
      ["7", "PENDENTE", "0.00"],
      ["10", "CONCILIADA", "1000.10"],
      ["20", "PARCIAL", "100.00"],
      ["30", "PENDENTE", "0.00"],
    ]);
  });

  it("t3: extrato inexistente devolve nulo, não um extrato vazio", async () => {
    expect(await lerExtratoImportado(prisma, "nao-existe")).toBeNull();
  });
});
