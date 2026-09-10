import { describe, expect, it } from "vitest";
import { medirCobertura, CONFIGS } from "../scripts/cobertura-de-tsconfig.js";

/**
 * ⚠️ NENHUM `.ts`/`.tsx` DO REPOSITÓRIO PODE FICAR FORA DOS TRÊS TSCONFIG.
 *
 * ═══ POR QUE ESTE TESTE EXISTE ═══
 * **Buraco na rede é pior que ausência de rede.** Quem vê `typecheck`, `typecheck:app` e
 * `typecheck:scripts` verdes conclui que o repositório inteiro compila. Se parte dele não
 * está em config nenhum, os três verdes são verdadeiros e a conclusão é falsa.
 *
 * A varredura de 2026-09-10 achou **34 arquivos fora dos três**, e dois doeram:
 *
 *   · `middleware.ts` — código de PRODUÇÃO, roda em TODA requisição;
 *   · `prisma/seed/**` — 29 arquivos, **cinco deles `.test.ts` que a suíte EXECUTA**.
 *
 * E, antes, `test/` inteiro estava fora — escondendo 12 erros reais, um dos quais um
 * import sem extensão que fazia um módulo resolver como `any` e apagava três erros de
 * tipo por tabela.
 *
 * ⚠️ A CONTAGEM NÃO É FIXADA DE PROPÓSITO. Um `expect(total).toBe(698)` quebraria a cada
 * arquivo novo e seria desligado na terceira vez. O que se afirma é a INVARIANTE — zero
 * descobertos —, que só quebra quando alguém realmente abre um buraco.
 *
 * Custo medido: ~6 s (três `tsc --listFilesOnly`). É o preço de a rede não ter buraco.
 */
describe("cobertura de tsconfig", () => {
  it("nenhum arquivo .ts/.tsx fica fora dos três tsconfig", { timeout: 120_000 }, () => {
    const c = medirCobertura();

    expect(
      c.descobertos,
      `${c.descobertos.length} arquivo(s) fora dos três tsconfig.\n\n` +
        `Um arquivo aqui NÃO é compilado por ninguém — nem no gate, nem no editor com ` +
        `o projeto certo. Se for teste, ele roda sem nunca ter sido compilado.\n\n` +
        `Acrescente-o ao config certo:\n` +
        `  · domínio, pacotes, adapters e testes de banco -> tsconfig.backend.json\n` +
        `  · app/, components/, lib/ e testes de UI (.tsx) -> tsconfig.json\n` +
        `  · scripts/ e prisma/seed/                       -> tsconfig.scripts.json\n\n` +
        `Fora dos três:\n` +
        c.descobertos.map((d) => `  · ${d}`).join("\n")
    ).toEqual([]);

    // Amarração de sanidade: se um config parar de enxergar qualquer arquivo (um
    // `include` quebrado, por exemplo), o teste acima poderia passar por outro caminho.
    for (const cfg of CONFIGS) {
      expect(c.porConfig[cfg], `${cfg} não enxergou arquivo nenhum`).toBeGreaterThan(50);
    }
    expect(c.total).toBeGreaterThan(500);
  });
});
