import { describe, expect, it } from "vitest";
import { alfa } from "./manad/dominio.js";

/**
 * O HISTÓRICO DE UM FATO NO MANAD (V22) — o travessão e as aspas tipográficas de um histórico de
 * empenho, liquidação ou pagamento (fato append-only, que não se corrige) viram o equivalente
 * Latin-1; em qualquer outro campo continuam derrubando a geração, e qualquer outro caractere
 * fora do Latin-1 continua derrubando em todo campo. Os esperados estão escritos à mão.
 */
describe("MANAD — pontuação tipográfica nos históricos", () => {
  const ENTRADA = "Aquisição de peças — lote 1 “urgente”, conforme OC n’ 7 – revisão…";
  const ESPERADO = 'Aquisição de peças - lote 1 "urgente", conforme OC n\' 7 - revisão...';

  it("N=3: nos três históricos de execução, a pontuação vira Latin-1 e a acentuação fica intacta", () => {
    expect(alfa(ENTRADA, { registro: "L050", campo: "HIST_EMP" })).toBe(ESPERADO);
    expect(alfa(ENTRADA, { registro: "L100", campo: "HIST_LIQUID" })).toBe(ESPERADO);
    expect(alfa(ENTRADA, { registro: "L150", campo: "HIST_PGTO" })).toBe(ESPERADO);
  });

  it("fora dos históricos, o travessão continua recusado — nomeando o caractere e o campo", () => {
    expect(() => alfa("Construtora Alfa — Filial", { registro: "L050", campo: "NOM_CREDOR" })).toThrow(
      /CARACTERE FORA DO ISO 8859-1 no registro L050, campo NOM_CREDOR: "—" \(U\+2014\)/
    );
  });

  it("no histórico, o que não é pontuação do rol (emoji) continua recusado", () => {
    expect(() => alfa("pago \u{1F600}", { registro: "L050", campo: "HIST_EMP" })).toThrow(/campo HIST_EMP: .*U\+1F600/);
  });

  it("o pipe continua recusado no histórico — a normalização não o cria nem o esconde", () => {
    expect(() => alfa("lote 1 | lote 2", { registro: "L050", campo: "HIST_EMP" })).toThrow(/PIPE/);
  });
});
