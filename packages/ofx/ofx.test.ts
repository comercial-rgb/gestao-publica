import { describe, expect, it } from "vitest";
import { OfxInvalidoError, parseOfx } from "./parser.js";

/**
 * O parser é a FRONTEIRA com o banco — o lugar onde um dado errado entra e vira
 * verdade contábil. Por isso cada modo de arquivo inválido tem teste próprio.
 */

/** Um OFX 1.x mínimo e VÁLIDO (SGML: as tags folha não fecham). */
function ofx(transacoes: string, cabecalho = ""): string {
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
${cabecalho}${transacoes}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

function trn(campos: {
  fitid?: string | undefined;
  dt?: string | undefined;
  amt?: string | undefined;
  memo?: string | undefined;
  checknum?: string | undefined;
}): string {
  const linhas = ["<STMTTRN>", "<TRNTYPE>OTHER"];
  if (campos.dt !== undefined) linhas.push(`<DTPOSTED>${campos.dt}`);
  if (campos.amt !== undefined) linhas.push(`<TRNAMT>${campos.amt}`);
  if (campos.fitid !== undefined) linhas.push(`<FITID>${campos.fitid}`);
  if (campos.checknum !== undefined) linhas.push(`<CHECKNUM>${campos.checknum}`);
  if (campos.memo !== undefined) linhas.push(`<MEMO>${campos.memo}`);
  linhas.push("</STMTTRN>");
  return linhas.join("\n");
}

const VALIDA = { fitid: "F1", dt: "20260115120000[-3:BRT]", amt: "-1500.00", memo: "PAGTO FORNECEDOR" };

describe("OFX — arquivo válido", () => {
  it("lê cabeçalho e transações", () => {
    const e = parseOfx(ofx(trn(VALIDA)));

    expect(e.moeda).toBe("BRL");
    expect(e.acctid).toBe("12345-6");
    expect(e.bankid).toBe("001");
    expect(e.periodoInicio?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(e.periodoFim?.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(e.transacoes).toHaveLength(1);
  });

  it("CHECKNUM é opcional; MEMO e FITID vêm inteiros", () => {
    const comDoc = parseOfx(ofx(trn({ ...VALIDA, checknum: "000123" })));
    expect(comDoc.transacoes[0]!.documento).toBe("000123");
    expect(comDoc.transacoes[0]!.memo).toBe("PAGTO FORNECEDOR");

    const semDoc = parseOfx(ofx(trn(VALIDA)));
    expect(semDoc.transacoes[0]!.documento).toBeUndefined();
  });

  it("várias transações, na ordem do arquivo", () => {
    const e = parseOfx(
      ofx(
        [
          trn({ fitid: "A", dt: "20260105", amt: "100.00", memo: "m1" }),
          trn({ fitid: "B", dt: "20260106", amt: "-50.00", memo: "m2" }),
        ].join("\n")
      )
    );
    expect(e.transacoes.map((t) => t.fitid)).toEqual(["A", "B"]);
  });
});

describe("OFX — a NORMALIZAÇÃO DO SINAL na fronteira", () => {
  it("TRNAMT NEGATIVO vira DEBITO com valor ABSOLUTO", () => {
    const e = parseOfx(ofx(trn({ ...VALIDA, amt: "-1500.00" })));
    const t = e.transacoes[0]!;
    expect(t.natureza).toBe("DEBITO");
    // valor SEMPRE positivo: o sinal virou natureza
    expect(t.valor.toFixed(2)).toBe("1500.00");
  });

  it("TRNAMT POSITIVO vira CREDITO", () => {
    const e = parseOfx(ofx(trn({ ...VALIDA, amt: "2500.50" })));
    const t = e.transacoes[0]!;
    expect(t.natureza).toBe("CREDITO");
    expect(t.valor.toFixed(2)).toBe("2500.50");
  });

  it("TRNAMT ZERO é REJEITADO — o banco não movimenta zero", () => {
    expect(() => parseOfx(ofx(trn({ ...VALIDA, amt: "0.00" })))).toThrow(
      /não movimenta zero/
    );
  });
});

describe("OFX — DTPOSTED (com e sem timezone)", () => {
  it("YYYYMMDD puro", () => {
    const e = parseOfx(ofx(trn({ ...VALIDA, dt: "20260115" })));
    expect(e.transacoes[0]!.dataPostagem.toISOString()).toBe(
      "2026-01-15T00:00:00.000Z"
    );
  });

  it("com hora e timezone: só a DATA é guardada", () => {
    // A hora é do fuso do BANCO. Guardá-la convidaria a comparar timestamps de
    // fusos diferentes — o extrato é um documento de DIA.
    const e = parseOfx(ofx(trn({ ...VALIDA, dt: "20260115235959[-3:BRT]" })));
    expect(e.transacoes[0]!.dataPostagem.toISOString()).toBe(
      "2026-01-15T00:00:00.000Z"
    );
  });

  it("REJEITA data que não existe (o Date corrigiria em silêncio)", () => {
    // 31/02 viraria 03/03 num `new Date` ingênuo.
    expect(() => parseOfx(ofx(trn({ ...VALIDA, dt: "20260231" })))).toThrow(
      /não é uma data real/
    );
  });

  it("REJEITA DTPOSTED ilegível", () => {
    expect(() => parseOfx(ofx(trn({ ...VALIDA, dt: "15/01/2026" })))).toThrow(
      /não começa com uma data/
    );
    expect(() => parseOfx(ofx(trn({ ...VALIDA, dt: "20260115XPTO" })))).toThrow(
      /sobra ilegível/
    );
  });
});

describe("OFX — FAIL-CLOSED (nada é importado de arquivo parcialmente válido)", () => {
  it("tag obrigatória ausente: DTPOSTED, TRNAMT, FITID, MEMO", () => {
    expect(() => parseOfx(ofx(trn({ ...VALIDA, dt: undefined })))).toThrow(/DTPOSTED ausente/);
    expect(() => parseOfx(ofx(trn({ ...VALIDA, amt: undefined })))).toThrow(/TRNAMT ausente/);
    expect(() => parseOfx(ofx(trn({ ...VALIDA, fitid: undefined })))).toThrow(/FITID ausente/);
    expect(() => parseOfx(ofx(trn({ ...VALIDA, memo: undefined })))).toThrow(/MEMO ausente/);
  });

  it("FITID vazio é ausente", () => {
    expect(() => parseOfx(ofx(trn({ ...VALIDA, fitid: "" })))).toThrow(/FITID ausente/);
  });

  it("TRNAMT não numérico", () => {
    expect(() => parseOfx(ofx(trn({ ...VALIDA, amt: "1.500,00" })))).toThrow(
      /não é um número decimal/
    );
    expect(() => parseOfx(ofx(trn({ ...VALIDA, amt: "abc" })))).toThrow(
      /não é um número decimal/
    );
  });

  it("moeda != BRL", () => {
    const usd = ofx(trn(VALIDA)).replace("<CURDEF>BRL", "<CURDEF>USD");
    expect(() => parseOfx(usd)).toThrow(/não é BRL/);
  });

  it("CURDEF ou ACCTID ausentes", () => {
    const semMoeda = ofx(trn(VALIDA)).replace("<CURDEF>BRL\n", "");
    expect(() => parseOfx(semMoeda)).toThrow(/CURDEF \(moeda\) ausente/);

    const semConta = ofx(trn(VALIDA)).replace("<ACCTID>12345-6\n", "");
    expect(() => parseOfx(semConta)).toThrow(/ACCTID.*ausente/);
  });

  it("STMTTRN truncado (arquivo cortado no meio)", () => {
    const truncado = ofx(trn(VALIDA)).replace("</STMTTRN>", "");
    expect(() => parseOfx(truncado)).toThrow(/aberto e não fechado/);
  });

  it("arquivo sem tag nenhuma", () => {
    expect(() => parseOfx("isto não é um OFX")).toThrow(/nenhuma tag OFX/);
  });

  it("UMA linha podre derruba o ARQUIVO INTEIRO (não só a linha)", () => {
    // 3 transações, a do meio com TRNAMT quebrado. Meio extrato é pior que
    // nenhum: ele parece completo.
    const arquivo = ofx(
      [
        trn({ fitid: "A", dt: "20260105", amt: "100.00", memo: "ok" }),
        trn({ fitid: "B", dt: "20260106", amt: "R$ 50", memo: "podre" }),
        trn({ fitid: "C", dt: "20260107", amt: "70.00", memo: "ok" }),
      ].join("\n")
    );
    expect(() => parseOfx(arquivo)).toThrow(/não é um número decimal/);
  });

  it("o erro diz a LINHA — é o que torna o arquivo depurável", () => {
    let erro: unknown;
    try {
      parseOfx(ofx(trn({ ...VALIDA, amt: "xxx" })));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(OfxInvalidoError);
    const e = erro as OfxInvalidoError;
    expect(e.linha).toBeGreaterThan(1);
    expect(String(e)).toMatch(/linha \d+/);
  });
});
