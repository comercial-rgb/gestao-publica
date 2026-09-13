import { describe, expect, it } from "vitest";
import { fingerprintDoFormulario, tuplasDoFormulario, TETO_DO_DIGEST } from "../lib/portas/comando.js";

/**
 * O FINGERPRINT CANÔNICO (sessão noturna V4, 3 — achado A03). O anterior concatenava
 * `nome valor` sem separador e ignorava arquivos; a auditoria mostrou duas estruturas
 * distintas com a mesma representação e dois arquivos diferentes com o mesmo resumo. Cada
 * caso abaixo é um desses defeitos, com a expectativa correta.
 */

function form(pares: readonly (readonly [string, string | Blob])[]): FormData {
  const f = new FormData();
  for (const [k, v] of pares) f.append(k, v);
  return f;
}

describe("o fingerprint do comando é inequívoco", () => {
  it("t1: a colisão antiga — `a=x, b=y` e `a=xb y` — deixa de colidir", async () => {
    const a = await fingerprintDoFormulario(form([["a", "x"], ["b", "y"]]));
    const b = await fingerprintDoFormulario(form([["a", "xb y"]]));
    expect(a).not.toBe(b);
    const c = await fingerprintDoFormulario(form([["a", "x by"]]));
    expect(c).not.toBe(a);
  });

  it("t2: campos repetidos preservam a ORDEM (os itens de uma lista têm ordem com significado)", async () => {
    const a = await fingerprintDoFormulario(form([["item", "1"], ["item", "2"]]));
    const b = await fingerprintDoFormulario(form([["item", "2"], ["item", "1"]]));
    expect(a).not.toBe(b);
  });

  it("t3: dois arquivos com o mesmo nome, tipo e tamanho e BYTES diferentes dão resumos diferentes; o mesmo conteúdo dá o mesmo", async () => {
    const x = new File([new Uint8Array([1, 2, 3])], "nota.pdf", { type: "application/pdf" });
    const y = new File([new Uint8Array([1, 2, 4])], "nota.pdf", { type: "application/pdf" });
    const x2 = new File([new Uint8Array([1, 2, 3])], "nota.pdf", { type: "application/pdf" });
    const fx = await fingerprintDoFormulario(form([["anexo", x], ["descricao", "d"]]));
    const fy = await fingerprintDoFormulario(form([["anexo", y], ["descricao", "d"]]));
    const fx2 = await fingerprintDoFormulario(form([["anexo", x2], ["descricao", "d"]]));
    expect(fx).not.toBe(fy);
    expect(fx).toBe(fx2);
    const tuplas = await tuplasDoFormulario(form([["anexo", x]]));
    expect(tuplas[0]).toEqual(["f", "anexo", "nota.pdf", "application/pdf", 3, expect.stringMatching(/^[0-9a-f]{64}$/)]);
  });

  it("t4: os metadados de transporte (`__chave`, `$ACTION*`) não fazem parte do comando", async () => {
    const a = await fingerprintDoFormulario(form([["a", "x"], ["__chave", "k1"], ["$ACTION_ID_abc", "1"]]));
    const b = await fingerprintDoFormulario(form([["a", "x"], ["__chave", "k2"]]));
    expect(a).toBe(b);
  });

  it("t5: um arquivo acima do teto não é digerido — e a tupla DIZ isso, com o tamanho", async () => {
    const grande = {
      name: "g.bin",
      type: "application/octet-stream",
      size: TETO_DO_DIGEST + 1,
      arrayBuffer: () => Promise.reject(new Error("não deveria ler")),
    } as unknown as File;
    const falso = { entries: () => [["a", "x"], ["anexo", grande]][Symbol.iterator]() } as unknown as FormData;
    const tuplas = await tuplasDoFormulario(falso);
    expect(tuplas[1]).toEqual(["f-nao-digerido", "anexo", "g.bin", "application/octet-stream", TETO_DO_DIGEST + 1]);
  });
});
