import { describe, expect, it, vi } from "vitest";
import { ROTULO_DA_SITUACAO_DA_ORDEM, rotuloDaSituacaoDaOrdem, SITUACAO_NAO_RECONHECIDA } from "../../app/(areas)/licitacoes/situacao-da-ordem";
import { situacaoDaOrdem } from "../../modules/m11-licitacoes/execucao-do-contrato";

/**
 * V39-012 — nenhuma situação da ordem aparece como código cru. Cada situação que a régua produz tem frase; a que
 * escapar do tipo vira a frase de negócio de "não reconhecida", com registro no servidor.
 */
describe("V39 — o rótulo da situação da ordem de serviço", () => {
  it("cada situação que a régua produz tem rótulo próprio, em minúsculas, que não é o código", () => {
    const produzidas = [
      situacaoDaOrdem({ descarte: {}, emissao: null, movimentos: [] }),
      situacaoDaOrdem({ descarte: null, emissao: null, movimentos: [] }),
      situacaoDaOrdem({ descarte: null, emissao: {}, movimentos: [{ tipo: "SUSPENSAO" }] }),
      situacaoDaOrdem({ descarte: null, emissao: {}, movimentos: [{ tipo: "SUSPENSAO" }, { tipo: "RETOMADA" }] }),
    ];
    expect(produzidas).toEqual(["DESCARTADA", "RASCUNHO", "SUSPENSA", "EMITIDA"]);
    for (const s of produzidas) {
      const r = rotuloDaSituacaoDaOrdem(s);
      expect(r).toBe(ROTULO_DA_SITUACAO_DA_ORDEM[s]);
      expect(r.texto).not.toBe(s);
      expect(r.texto).toBe(r.texto.toLowerCase());
    }
  });

  it("situação fora do tipo vira a frase de negócio, nunca o código, e deixa registro", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = rotuloDaSituacaoDaOrdem("ENCERRADA_PELO_SISTEMA");
    expect(r).toBe(SITUACAO_NAO_RECONHECIDA);
    expect(r.texto).not.toContain("ENCERRADA_PELO_SISTEMA");
    expect(erro).toHaveBeenCalledWith(expect.stringContaining("ENCERRADA_PELO_SISTEMA"));
    erro.mockRestore();
  });
});
