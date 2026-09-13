import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * TODO DESCRITOR DO MOLDE É INSTANCIADO AQUI (sessão noturna V4, §10).
 *
 * ⚠️ O DEFEITO QUE ISTO VIGIA JÁ ACONTECEU: `definirRecurso` valida a consistência do descritor
 * ao ser chamado — e ele é chamado quando o MÓDULO do descritor é importado. O descritor dos
 * termos ganhou a aba de anexos sem a ação de anexar; nenhum teste importava aquele módulo, o
 * typecheck não o vê, e o `next build` derrubou a rota em produção ("Failed to collect page
 * data"). Importar todos os descritores na partição rápida faz a recusa aparecer aqui, em
 * segundos, e não no build.
 *
 * Os descritores moram em `lib/portas/recursos/*.ts` sem o sufixo `-dados` (os `-dados` são
 * portas com Prisma e ficam fora — e fora da partição rápida). Um descritor que importe Prisma
 * quebraria este teste: também é o que se quer.
 */

const PASTA = new URL("../../lib/portas/recursos/", import.meta.url);

describe("os descritores do molde são consistentes", () => {
  it("t1: importar todos os descritores não lança — a validação de definirRecurso passa em cada um", async () => {
    const arquivos = readdirSync(PASTA).filter((n) => n.endsWith(".ts") && !n.endsWith("-dados.ts") && !n.endsWith(".test.ts") && n !== "dados.ts");
    expect(arquivos.length).toBeGreaterThan(5);
    const falhas: string[] = [];
    for (const n of arquivos) {
      try {
        await import(new URL(n, PASTA).href);
      } catch (e) {
        falhas.push(`${n}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    }
    expect(falhas, "\n\nDESCRITOR INCONSISTENTE — o build derrubaria a rota:\n").toEqual([]);
  });
});
