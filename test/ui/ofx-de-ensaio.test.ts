import { describe, expect, it } from "vitest";
import { textoDoArquivoOfx } from "../../lib/portas/conciliacao";
import { diaDoBanco } from "../../modules/m09-tesouraria/dia-do-banco";
import { parseOfx } from "../../packages/ofx/index.js";
import { emWindows1252, ofxDeEnsaio } from "../../scripts/ofx-de-ensaio";

/**
 * V39-007 — O OFX DE ENSAIO DIZ O CHARSET QUE USA. Ida e volta pelo decodificador da PLATAFORMA (TextDecoder,
 * implementação independente da tabela do gerador), pelo leitor do sistema (`textoDoArquivoOfx`, que escolhe o
 * charset pelo cabeçalho) e pelo parser de OFX. Acento, cedilha, travessão e aspas curvas; o último dia do mês e o
 * primeiro do seguinte (N=2 na borda).
 */

const MEMOS = ["CAUÇÃO — CONTRATO 12/2026", "TARIFA “PACOTE” DE SERVIÇOS – JUNHO"];

describe("V39 — o OFX de ensaio em windows-1252", () => {
  it("cada caractere vira o byte do windows-1252, e a plataforma lê de volta o mesmo texto", () => {
    const texto = `${MEMOS.join(" | ")} € Ç ã`;
    const bytes = emWindows1252(texto);
    expect(new TextDecoder("windows-1252").decode(bytes)).toBe(texto);
    // o travessão é 0x97 em windows-1252, e não 0x14 (o que o "latin1" do Node gravava)
    expect(Array.from(emWindows1252("—"))).toEqual([0x97]);
    expect(Array.from(Buffer.from("—", "latin1"))).toEqual([0x14]);
  });

  it("o que o windows-1252 não representa é recusado, nomeando o caractere", () => {
    expect(() => emWindows1252("ok 😀")).toThrow(/"😀" \(U\+1F600, posição 3\) não existe em windows-1252/);
    expect(() => emWindows1252("Ā")).toThrow(/U\+0100/);
    expect(() => emWindows1252("\u0085")).toThrow(/U\+0085/);
  });

  it("o sistema importa o arquivo com o memo intacto e o dia que o banco informou, na virada do mês", () => {
    const bytes = ofxDeEnsaio({
      acctid: "DEMO-1",
      inicio: "2026-06-01",
      fim: "2026-07-01",
      transacoes: [
        { fitid: "E1", dia: "2026-06-30", valor: "600.00", memo: MEMOS[0] ?? "" },
        { fitid: "E2", dia: "2026-07-01", valor: "-8.90", memo: MEMOS[1] ?? "" },
      ],
    });
    const texto = textoDoArquivoOfx(bytes);
    expect(texto).toContain("CHARSET:1252");
    const extrato = parseOfx(texto);
    expect(extrato.transacoes.map((t) => ({ fitid: t.fitid, dia: diaDoBanco(t.dataPostagem), memo: t.memo, natureza: t.natureza, valor: t.valor.toFixed(2) }))).toEqual([
      { fitid: "E1", dia: "2026-06-30", memo: MEMOS[0], natureza: "CREDITO", valor: "600.00" },
      { fitid: "E2", dia: "2026-07-01", memo: MEMOS[1], natureza: "DEBITO", valor: "8.90" },
    ]);
    // nenhum caractere de controle chegou ao memo
    expect(extrato.transacoes.some((t) => /[\u0000-\u001f\u007f-\u009f]/.test(t.memo))).toBe(false);
  });

  it("valor fora do formato decimal, dia malformado e memo com < > são recusados antes de gerar", () => {
    const base = { acctid: "D", inicio: "2026-06-01", fim: "2026-06-30" };
    expect(() => ofxDeEnsaio({ ...base, transacoes: [{ fitid: "X", dia: "2026-06-01", valor: "10.5", memo: "m" }] })).toThrow(/"10.5".*duas casas/);
    expect(() => ofxDeEnsaio({ ...base, transacoes: [{ fitid: "X", dia: "01/06/2026", valor: "10.50", memo: "m" }] })).toThrow(/AAAA-MM-DD/);
    expect(() => ofxDeEnsaio({ ...base, transacoes: [{ fitid: "X", dia: "2026-06-01", valor: "10.50", memo: "a<b" }] })).toThrow(/não admite/);
  });
});
