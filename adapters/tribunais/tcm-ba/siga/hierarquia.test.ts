import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { camposHierarquiaSiga } from "./hierarquia.js";
import { montarLinha } from "./writer.js";
import { SPEC_EMPENHO } from "./specs/index.js";
import { EMPENHO_GOLDEN, SEQUENCIAL_GOLDEN } from "./fixtures/empenho-golden.js";

/**
 * A ARMADILHA DOS NOMES TROCADOS — e o teste que a torna incaível.
 *
 * `cd_Programa` recebe a SUBFUNÇÃO e `cd_SubPrograma` recebe o PROGRAMA. Um mapper escrito por
 * intuição de nome produz arquivo estruturalmente perfeito com a classificação funcional trocada:
 * largura certa, posição certa, o TCM aceita — e a despesa aparece na função errada num relatório
 * do Tribunal meses depois.
 */

describe("SIGA — a hierarquia funcional-programática (nomes trocados)", () => {
  it("cd_Programa recebe a SUBFUNÇÃO e cd_SubPrograma recebe o PROGRAMA", () => {
    const campos = camposHierarquiaSiga({
      funcao: "04",
      subfuncao: "122",
      programa: "0001",
    });

    expect(campos.cd_Funcao).toBe("04");
    // ⚠️ AQUI ESTÁ A TROCA. Se algum dia estas duas asserções forem "corrigidas" para o que o
    // nome sugere, o arquivo passa a sair com a classificação funcional invertida.
    expect(campos.cd_Programa).toBe("122"); // a SUBfunção
    expect(campos.cd_SubPrograma).toBe("0001"); // o PROGRAMA
  });

  it("a troca sobrevive à serialização — o byte no arquivo é o da subfunção", () => {
    const h = camposHierarquiaSiga({ funcao: "04", subfuncao: "122", programa: "0001" });
    const linha = montarLinha(
      SPEC_EMPENHO,
      { ...EMPENHO_GOLDEN, ...h },
      SEQUENCIAL_GOLDEN
    );

    // Empenho: cd_Funcao 478-479, cd_Programa 480-483, cd_SubPrograma 484-487.
    expect(linha.slice(478, 480)).toBe("04");
    expect(linha.slice(480, 484)).toBe(" 122"); // subfunção, N alinhado à direita
    expect(linha.slice(484, 488)).toBe("0001"); // programa
  });

  /**
   * ⚠️ O GREP QUE IMPEDE O ATALHO.
   *
   * A função só protege quem a usa. Um mapper que escreva `cd_Programa: programa.codigo` direto
   * compila, roda e mente. Este teste varre o adapter e recusa qualquer atribuição literal desses
   * dois campos fora do `hierarquia.ts` e das SPECS (onde o nome é só a posição do layout).
   */
  it("ninguém atribui cd_Programa/cd_SubPrograma fora do hierarquia.ts", () => {
    const RAIZ = fileURLToPath(new URL("..", import.meta.url));
    const permitidos = ["siga/hierarquia.ts", "siga/hierarquia.test.ts"];

    const arquivos: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          varrer(p);
          continue;
        }
        if (e.name.endsWith(".ts")) arquivos.push(p);
      }
    };
    varrer(RAIZ);
    expect(arquivos.length).toBeGreaterThan(5);

    // `cd_Programa:` como CHAVE de objeto com valor — a assinatura da atribuição. As specs
    // declaram `nome: "cd_Programa"` (string), que é outra coisa e não casa.
    const ATRIBUICAO = /\bcd_(Programa|SubPrograma)\s*:/;

    const infratores: string[] = [];
    for (const abs of arquivos) {
      const rel = abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
      if (permitidos.includes(rel)) continue;

      readFileSync(abs, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;
          if (ATRIBUICAO.test(linha)) infratores.push(`${rel}:${i + 1}  ${linha.trim()}`);
        });
    }

    expect(
      infratores,
      "\n\n⚠️ ALGUÉM ATRIBUIU cd_Programa/cd_SubPrograma DIRETAMENTE.\n\n" +
        "No SIGA esses nomes MENTEM: `cd_Programa` recebe a SUBFUNÇÃO e `cd_SubPrograma` recebe o " +
        "PROGRAMA. Atribuir pelo nome produz um arquivo estruturalmente PERFEITO com a " +
        "classificação funcional trocada — o TCM aceita, nenhum teste acusa, e o erro só aparece " +
        "num relatório do Tribunal meses depois.\n\n" +
        "Use `camposHierarquiaSiga({ funcao, subfuncao, programa })`, que recebe os três por nome " +
        "de DOMÍNIO e aplica a troca uma vez só.\n\nInfratores:\n"
    ).toEqual([]);
  });
});
