import { describe, expect, it } from "vitest";
import { lerRascunho, serializarRascunho, VALIDADE_DO_RASCUNHO_MS } from "../lib/rascunho-do-formulario.js";

/**
 * V38 (AUD-015) — O RASCUNHO DO EMPENHO QUE ATRAVESSA O ATALHO DE CADASTRO. Ele repõe só o que a pessoa digitou na
 * própria aba, uma vez, por pouco tempo; qualquer coisa estranha descarta o rascunho INTEIRO (nunca uma parte).
 * N=2 campos em todo caso, para "volta tudo" e "volta um" serem distinguíveis.
 */
const DECLARADOS = ["fichaId", "valor", "historico"] as const;
const AGORA = new Date("2026-10-09T15:00:00Z");

describe("V38 — o rascunho do formulário (puro)", () => {
  it("volta com os campos declarados e não vazios", () => {
    const t = serializarRascunho({ fichaId: "f-1", valor: "1500.00", historico: "" }, AGORA);
    expect(lerRascunho(t, DECLARADOS, new Date(AGORA.getTime() + 60_000))).toEqual({ fichaId: "f-1", valor: "1500.00" });
  });

  it("vencido (mais de 2 h), do futuro, vazio, malformado, de outra versão ou com campo não declarado: descartado inteiro", () => {
    const bom = serializarRascunho({ fichaId: "f-1", valor: "1500.00" }, AGORA);
    expect(lerRascunho(bom, DECLARADOS, new Date(AGORA.getTime() + VALIDADE_DO_RASCUNHO_MS))).not.toBeNull();
    expect(lerRascunho(bom, DECLARADOS, new Date(AGORA.getTime() + VALIDADE_DO_RASCUNHO_MS + 1))).toBeNull();
    expect(lerRascunho(bom, DECLARADOS, new Date(AGORA.getTime() - 1))).toBeNull();
    expect(lerRascunho(null, DECLARADOS, AGORA)).toBeNull();
    expect(lerRascunho("{não é json", DECLARADOS, AGORA)).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 2, em: AGORA.getTime(), campos: { fichaId: "f-1" } }), DECLARADOS, AGORA)).toBeNull();
    expect(lerRascunho(serializarRascunho({ fichaId: "f-1", credor: "12345678000195" }, AGORA), DECLARADOS, AGORA)).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 1, em: AGORA.getTime(), campos: { fichaId: "f-1", valor: 1500 } }), DECLARADOS, AGORA)).toBeNull();
    expect(lerRascunho(serializarRascunho({ fichaId: "", valor: "" }, AGORA), DECLARADOS, AGORA)).toBeNull();
  });
});
