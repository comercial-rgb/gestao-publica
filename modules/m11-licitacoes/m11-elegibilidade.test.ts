import { describe, expect, it } from "vitest";
import { AtoInelegivelError, exigirElegivel } from "../../packages/contracts/index.js";
import {
  elegibilidadeParaCancelarDocumento,
  elegibilidadeParaConferirDocumento,
  elegibilidadeParaEmpenharOrdem,
  elegibilidadeParaEstornarOrdem,
  elegibilidadeParaReceberOrdem,
  type EstadoDaOrdemParaAtos,
  type EstadoDoDocumentoParaAtos,
} from "./elegibilidade.js";

/**
 * PREDICADOS PUROS DO DOCUMENTO FISCAL E DA ORDEM (V6.2 U0). A paridade com o caso de uso real está
 * nos testes de `m11-documento-fiscal` e `m11-compras`, que continuam recusando pelas mesmas
 * frases — agora vindas daqui. Este arquivo prende a TABELA: cada estado, o código esperado,
 * escrito à mão.
 */

const DOC: EstadoDoDocumentoParaAtos = { rotulo: "10/1", movimentos: [], emitenteConfereComOrdem: true, ordemNumero: "OC-1", recebimentos: 0, liquidacoesVivas: 0 };
const ORDEM: EstadoDaOrdemParaAtos = { numero: "OC-1", estornada: false, recebimentos: 0, empenhosVivos: [], itensPendentes: 2 };
const codigo = (e: ReturnType<typeof elegibilidadeParaConferirDocumento>): string => (e.situacao === "ELEGIVEL" ? "ELEGIVEL" : `${e.situacao}:${e.codigo}`);

describe("documento fiscal", () => {
  it.each([
    ["registrado", DOC, "ELEGIVEL", "ELEGIVEL"],
    ["conferido", { ...DOC, movimentos: ["CONFERENCIA"] }, "NAO_APLICAVEL:DOCUMENTO-JA-CONFERIDO", "ELEGIVEL"],
    ["cancelado", { ...DOC, movimentos: ["CONFERENCIA", "CANCELAMENTO"] }, "NAO_APLICAVEL:DOCUMENTO-ENCERRADO", "NAO_APLICAVEL:DOCUMENTO-ENCERRADO"],
    ["substituído", { ...DOC, movimentos: ["SUBSTITUICAO"] }, "NAO_APLICAVEL:DOCUMENTO-ENCERRADO", "NAO_APLICAVEL:DOCUMENTO-ENCERRADO"],
    ["emitente trocado", { ...DOC, emitenteConfereComOrdem: false }, "PRE_CONDICAO:EMITENTE-DIFERENTE-DO-FORNECEDOR", "ELEGIVEL"],
    ["com recebimento", { ...DOC, movimentos: ["CONFERENCIA"], recebimentos: 1 }, "NAO_APLICAVEL:DOCUMENTO-JA-CONFERIDO", "PRE_CONDICAO:DOCUMENTO-COM-RECEBIMENTO"],
    ["com liquidação viva", { ...DOC, movimentos: ["CONFERENCIA"], liquidacoesVivas: 2 }, "NAO_APLICAVEL:DOCUMENTO-JA-CONFERIDO", "PRE_CONDICAO:DOCUMENTO-COM-LIQUIDACAO"],
  ] as const)("%s → conferir %s, cancelar %s", (_n, e, conferir, cancelar) => {
    expect(codigo(elegibilidadeParaConferirDocumento(e))).toBe(conferir);
    expect(codigo(elegibilidadeParaCancelarDocumento(e))).toBe(cancelar);
  });

  it("a recusa do caso de uso preserva a frase que o operador já lia ('já lastreia')", () => {
    expect(() => exigirElegivel(elegibilidadeParaCancelarDocumento({ ...DOC, recebimentos: 1 }))).toThrow(/já lastreia 1 recebimento/);
    expect(() => exigirElegivel(elegibilidadeParaCancelarDocumento({ ...DOC, recebimentos: 1 }))).toThrow(AtoInelegivelError);
    expect(() => exigirElegivel(elegibilidadeParaCancelarDocumento({ ...DOC, recebimentos: 1 }))).toThrow(/Nada foi gravado\.$/);
  });
});

describe("ordem de compra", () => {
  it.each([
    ["viva, pendente", ORDEM, "ELEGIVEL", "ELEGIVEL", "ELEGIVEL"],
    ["estornada", { ...ORDEM, estornada: true, recebimentos: 1 }, "NAO_APLICAVEL:ORDEM-JA-ESTORNADA", "NAO_APLICAVEL:ORDEM-ESTORNADA", "NAO_APLICAVEL:ORDEM-ESTORNADA"],
    ["com recebimento", { ...ORDEM, recebimentos: 1 }, "PRE_CONDICAO:ORDEM-COM-RECEBIMENTO", "ELEGIVEL", "ELEGIVEL"],
    ["empenhada", { ...ORDEM, empenhosVivos: ["NE-1", "NE-2"] }, "PRE_CONDICAO:ORDEM-EMPENHADA", "ELEGIVEL", "ELEGIVEL"],
    ["tudo recebido", { ...ORDEM, recebimentos: 2, itensPendentes: 0 }, "PRE_CONDICAO:ORDEM-COM-RECEBIMENTO", "NAO_APLICAVEL:ORDEM-SEM-PENDENCIA", "ELEGIVEL"],
    ["pendência não lida", { ...ORDEM, itensPendentes: null }, "ELEGIVEL", "ELEGIVEL", "ELEGIVEL"],
  ] as const)("%s → estornar %s, receber %s, empenhar %s", (_n, e, estornar, receber, empenhar) => {
    expect(codigo(elegibilidadeParaEstornarOrdem(e))).toBe(estornar);
    expect(codigo(elegibilidadeParaReceberOrdem(e))).toBe(receber);
    expect(codigo(elegibilidadeParaEmpenharOrdem(e))).toBe(empenhar);
  });

  it("a mensagem da empenhada nomeia os empenhos vivos e a providência", () => {
    const e = elegibilidadeParaEstornarOrdem({ ...ORDEM, empenhosVivos: ["NE-1", "NE-2"] });
    expect(e.situacao === "ELEGIVEL" ? "" : `${e.motivo} ${e.providencia ?? ""}`).toMatch(/NE-1, NE-2.*Estorne o empenho/);
  });
});
