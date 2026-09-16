import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A ÁREA PÚBLICA (LC 131/2009) — a separação é ESTRUTURAL e se prova por onde os arquivos moram,
 * sem servidor: o público está FORA de `(areas)` e não chama `exigirSessao`; o autenticado tem o
 * `exigirSessao` no layout de `(areas)`, então continua barrado.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO DEIXOU DE ENUMERAR ARQUIVOS (V9 N1) ═══
 *
 * Até 16/09/2026 ele nomeava DOIS caminhos: `app/transparencia/demonstrativos/page.tsx` e a rota
 * do PDF. Isso é "guarda que enumera formas" — a regra do repositório avisa que ela acha só
 * aquelas formas. Duas consequências, as duas reais:
 *
 *   · **Ele não vigiava as páginas públicas que chegaram depois.** `/servicos`, `/ouvidoria`,
 *     `/consulta` e os contratos públicos nasceram sem cobertura nenhuma deste guard, e ninguém
 *     percebeu porque ele continuava verde.
 *   · **E quebrou por motivo errado.** Ao juntar as páginas públicas no grupo `(publico)`, os
 *     dois caminhos literais deixaram de existir e o teste ficou vermelho — não porque a
 *     separação tivesse se perdido (ela melhorou), mas porque o teste falava de arquivos e não
 *     da propriedade.
 *
 * Agora ele afirma a PROPRIEDADE: **toda** página e **toda** rota sob `app/(publico)/**` é
 * alcançável sem sessão, e o grupo autenticado continua com o guard. Página pública nova entra
 * na vigilância sozinha.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** Lê o CÓDIGO sem comentários — os arquivos MENCIONAM `exigirSessao`/`puppeteer` nos comentários
 *  (explicando que NÃO os usam); o que importa é o código, não a prosa. */
const ler = (rel: string): string =>
  readFileSync(join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

function varrer(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) achados.push(...varrer(p));
    else if (/\.(ts|tsx)$/.test(e.name)) achados.push(p);
  }
  return achados;
}

const PUBLICO = "app/(publico)";
const ARQUIVOS_PUBLICOS = varrer(PUBLICO);

describe("transparência pública — acessível sem sessão, autenticado barrado", () => {
  it("o grupo público existe e tem páginas de verdade", () => {
    // Uma varredura vazia faria todo teste abaixo passar por vacuidade — e um grupo público
    // apagado por acidente ficaria verde.
    expect(
      ARQUIVOS_PUBLICOS.length,
      `nenhum arquivo em ${PUBLICO}. Os testes seguintes passariam sem provar nada.`
    ).toBeGreaterThanOrEqual(10);
    const paginas = ARQUIVOS_PUBLICOS.filter((f) => /\/page\.tsx$/.test(f));
    expect(paginas.length).toBeGreaterThanOrEqual(6);
  });

  it("NENHUM arquivo do grupo público chama exigirSessao — a porta aberta continua aberta", () => {
    const comGuard = ARQUIVOS_PUBLICOS.filter((f) => ler(f).includes("exigirSessao"));
    expect(
      comGuard,
      `estes arquivos públicos exigem sessão. Quem abre /transparencia sem conta cai no login, ` +
        `e a publicação ativa deixa de existir para exatamente quem ela serve:\n` +
        comGuard.map((f) => `  · ${relative(".", f)}`).join("\n")
    ).toEqual([]);
  });

  it("o shell autenticado (areas) TEM o guard — as rotas internas continuam barradas", () => {
    const layout = ler("app/(areas)/layout.tsx");
    // ⚠️ É o layout de (areas) que barra: se este `exigirSessao` sumir, TODA a área interna abre.
    expect(layout).toContain("exigirSessao");
  });

  it("a casca pública tem cabeçalho e rodapé, e não herda o shell autenticado", () => {
    const layout = ler(`${PUBLICO}/layout.tsx`);
    expect(layout).not.toContain("exigirSessao");
    expect(layout).toContain("CabecalhoPublico");
    expect(layout).toContain("RodapeEngine");
  });

  it("o rol público é só metadado (sem puppeteer/porta) — a página não arrasta o Chromium", () => {
    const meta = ler("lib/pdf/lista-publica.ts");
    expect(meta).not.toContain("puppeteer");
    expect(meta).not.toContain("lib/portas");
    const pagina = ler(`${PUBLICO}/transparencia/demonstrativos/page.tsx`);
    expect(pagina).toContain("lista-publica");
    expect(pagina).not.toContain("gerar");
  });

  it("a rota do PDF público roda em nodejs — o puppeteer não roda no edge", () => {
    expect(ler(`${PUBLICO}/transparencia/demonstrativos/pdf/route.ts`)).toContain('runtime = "nodejs"');
  });

  it("/transparencia é PÚBLICO: não há segunda dona do endereço dentro de (areas)", () => {
    // ⚠️ A COLISÃO QUE ISTO IMPEDE DE VOLTAR. `app/(areas)/transparencia/page.tsx` ocupava
    // `/transparencia` — o endereço que o município divulga levava à tela de login, enquanto
    // as páginas públicas viviam no mesmo prefixo sob outra árvore de layout.
    const dentroDeAreas = varrer("app/(areas)").filter((f) => f.startsWith("app/(areas)/transparencia/"));
    expect(
      dentroDeAreas,
      `voltou a existir rota /transparencia dentro do grupo autenticado. A landing interna mora ` +
        `em /administracao/transparencia:\n` + dentroDeAreas.join("\n")
    ).toEqual([]);
    expect(ARQUIVOS_PUBLICOS).toContain(`${PUBLICO}/transparencia/page.tsx`);
  });
});
