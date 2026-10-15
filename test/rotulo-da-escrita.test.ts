import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { moduloDoRotuloDaBorda } from "../lib/portas/licenciamento.js";

/**
 * V39-R3 (R3-027) — TODO RÓTULO LITERAL DO ENVELOPE DE ESCRITA É CLASSIFICÁVEL.
 *
 * Medido pelo percurso da folha até o banco: a porta de criar lote mandava `comEscritaAutenticada("CRIAR_LOTE_PAGAMENTO")`
 * e a ação do censo é `CRIAR_LOTE_DE_PAGAMENTO`. O envelope recusa o rótulo desconhecido (certo, fail-closed), e por isso
 * criar lote pela tela falhava para todo mundo — e nenhum teste via, porque os testes chamam o serviço, não a porta.
 *
 * A PROPRIEDADE, não a lista: todo literal passado a `comEscritaAutenticada` em `lib/` e `app/` é classificado pela
 * MESMA função que o envelope usa (`moduloDoRotuloDaBorda`). Rótulo vindo de variável fica fora deste leitor (é
 * conferido pelo tipo onde a variável é `AcaoDoSistema`).
 */
const RAIZ = join(__dirname, "..");
function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}
const LITERAL = /comEscritaAutenticada\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g;

describe("V39-R3 — o rótulo literal da escrita é classificável", () => {
  const usos: { readonly arquivo: string; readonly rotulo: string }[] = [];
  for (const raiz of ["lib", "app"]) {
    for (const f of arquivos(join(RAIZ, raiz))) {
      const texto = readFileSync(f, "utf8");
      for (const m of texto.matchAll(LITERAL)) usos.push({ arquivo: relative(RAIZ, f), rotulo: m[1] as string });
    }
  }

  it("o leitor acha os usos (não passa por vacuidade)", () => {
    expect(usos.length).toBeGreaterThan(100);
    expect(usos.some((u) => u.rotulo === "CRIAR_LOTE_DE_PAGAMENTO" && u.arquivo.endsWith("tesouraria.ts"))).toBe(true);
  });

  it("cada literal é ação do censo ou rótulo de plataforma declarado", () => {
    const nao = usos.filter((u) => {
      try {
        moduloDoRotuloDaBorda(u.rotulo);
        return false;
      } catch {
        return true;
      }
    });
    expect(nao.map((u) => `${u.arquivo}: ${u.rotulo}`)).toEqual([]);
  });

  it("e o defeito que o percurso achou seria acusado", () => {
    expect(() => moduloDoRotuloDaBorda("CRIAR_LOTE_PAGAMENTO")).toThrow(/NÃO CLASSIFICADO/);
  });
});
