import { posix, win32 } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { caminhoDoAnexo, dentroDaRaiz } from "./armazenamento.js";

/**
 * A GUARDA DA RAIZ DOS ANEXOS, sem banco. A propriedade é "o caminho fica dentro da raiz", e ela é
 * afirmada com as regras de caminho dos DOIS sistemas na mesma máquina — a versão que comparava
 * prefixo com "/" passava no Mac e recusava todo anexo no Windows.
 */
describe("dentroDaRaiz", () => {
  const casos = [
    {
      nome: "POSIX",
      m: posix,
      raiz: "/srv/anexos",
      dentro: ["/srv/anexos", "/srv/anexos/ab/abcdef"],
      fora: ["/srv/anexos-2/x", "/srv/outro", "/srv"],
    },
    {
      nome: "Windows",
      m: win32,
      raiz: "C:\\dados\\anexos",
      dentro: ["C:\\dados\\anexos", "C:\\dados\\anexos\\ab\\abcdef"],
      fora: ["C:\\dados\\anexos-2\\x", "C:\\dados", "D:\\dados\\anexos\\ab"],
    },
  ];
  for (const c of casos) {
    it(`${c.nome}: aceita o que está dentro e recusa o vizinho de nome parecido, o pai e outro disco`, () => {
      for (const d of c.dentro) expect(dentroDaRaiz(c.raiz, d, c.m), d).toBe(true);
      for (const f of c.fora) expect(dentroDaRaiz(c.raiz, f, c.m), f).toBe(false);
    });
  }

  it("caminhoDoAnexo resolve dentro da raiz NESTA máquina (no Windows, era recusado)", () => {
    const raiz = `${tmpdir()}${process.platform === "win32" ? "\\" : "/"}anexos-teste`;
    const c = caminhoDoAnexo("abcdef123456", { ANEXOS_DIR: raiz });
    expect(c.endsWith("abcdef123456")).toBe(true);
    expect(dentroDaRaiz(raiz, c)).toBe(true);
  });
});
