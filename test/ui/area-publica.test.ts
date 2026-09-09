import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A ÁREA PÚBLICA (LC 131/2009) — a separação é ESTRUTURAL e se prova por onde os arquivos moram,
 * sem servidor: o público está FORA de `(areas)` e não chama `exigirSessao`; o autenticado tem o
 * `exigirSessao` no layout de `(areas)`, então continua barrado. Se alguém puser a rota pública
 * dentro de `(areas)`, ou tirar o guard do layout, este teste cai.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
/** Lê o CÓDIGO sem comentários — os arquivos MENCIONAM `exigirSessao`/`puppeteer` nos comentários
 *  (explicando que NÃO os usam); o que importa é o código, não a prosa. Mesma ideia do grep trivalente. */
const ler = (rel: string): string =>
  readFileSync(join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "") // blocos /* ... */
    .replace(/\/\/.*$/gm, ""); // linha // ...

describe("transparência pública — acessível sem sessão, autenticado barrado", () => {
  it("a página e a rota de PDF públicas moram FORA de (areas) e NÃO chamam exigirSessao", () => {
    // Existem no caminho público (app/transparencia/**), não no shell autenticado (app/(areas)/**).
    const pagina = ler("app/transparencia/demonstrativos/page.tsx");
    const rota = ler("app/transparencia/demonstrativos/pdf/route.ts");

    expect(pagina).not.toContain("exigirSessao");
    expect(rota).not.toContain("exigirSessao");
    // E a rota é nodejs (o puppeteer não roda no edge).
    expect(rota).toContain('runtime = "nodejs"');
  });

  it("o shell autenticado (areas) TEM o guard — as rotas internas continuam barradas", () => {
    const layout = ler("app/(areas)/layout.tsx");
    // ⚠️ É o layout de (areas) que barra: se este `exigirSessao` sumir, TODA a área interna abre.
    expect(layout).toContain("exigirSessao");
  });

  it("o rol público é só metadado (sem puppeteer/porta) — a página não arrasta o Chromium", () => {
    const meta = ler("lib/pdf/lista-publica.ts");
    expect(meta).not.toContain("puppeteer");
    expect(meta).not.toContain("lib/portas");
    // A página importa a META, não o motor.
    const pagina = ler("app/transparencia/demonstrativos/page.tsx");
    expect(pagina).toContain("lista-publica");
    expect(pagina).not.toContain("gerar");
  });
});
