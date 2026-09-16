import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O INVENTÁRIO DERIVADO DOS CHAMADORES (sessão noturna V4, 3): todo formulário que dispara
 * uma Server Action manda a chave de comando, e toda Server Action de `app/` passa pelo
 * comando do formulário. Não é uma lista escrita à mão: é o que o fonte contém.
 *
 *   · todo `<form ... action={...}>` (POST) em `app/(areas)` contém `<ChaveDeComando />`,
 *     UM POR FORMULÁRIO — o componente lê o estado do PRÓPRIO formulário;
 *   · todo `export async function` dos `actions.ts` de `app/` chama `comComandoDoFormulario`,
 *     salvo os declarados abaixo com o motivo (entrar/sair não são escritas autenticadas).
 *
 * O servidor recusa o comando sem chave (`ComandoSemChaveError`); este teste faz a recusa
 * aparecer aqui, antes de aparecer na tela.
 */

const RAIZ = new URL("../../", import.meta.url).pathname;

function arquivos(dir: string, filtro: (nome: string) => boolean): string[] {
  const saida: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "node_modules") continue;
      saida.push(...arquivos(p, filtro));
    } else if (filtro(e)) saida.push(p);
  }
  return saida;
}

/** As tags `<form ...>` de um fonte, inteiras. */
export function tagsDeFormulario(fonte: string): readonly string[] {
  const tags: string[] = [];
  let i = 0;
  for (;;) {
    const j = fonte.indexOf("<form", i);
    if (j < 0) return tags;
    const k = fonte.indexOf(">", j);
    tags.push(fonte.slice(j, k + 1));
    i = k + 1;
  }
}

export function ehFormularioDeAcao(tag: string): boolean {
  return tag.includes("action={") && !/method=["']get["']/i.test(tag);
}

/** Formulários de ação × chaves de comando num fonte. */
export function balancoDaChave(fonte: string): { readonly formularios: number; readonly chaves: number } {
  return {
    formularios: tagsDeFormulario(fonte).filter(ehFormularioDeAcao).length,
    chaves: (fonte.match(/<ChaveDeComando \/>/g) ?? []).length,
  };
}

const ACOES_SEM_COMANDO: Record<string, string> = {
  "app/login/actions.ts": "entrar: autenticação, não escrita autenticada (o registro do LOGIN é próprio)",
  "app/(areas)/actions.ts": "sairAction: revoga a sessão e limpa o cookie; não passa pelo envelope",
  "app/(areas)/integracoes/captura/page.tsx":
    "acaoSimular: a simulação MOCK da captura chama o serviço com exigirSessao, sem o envelope de " +
    "escrita autenticada — não consome a chave. Pendência CAPTURA-SEM-ENVELOPE.",
  "app/(publico)/ouvidoria/actions.ts":
    "atos PÚBLICOS sem conta (manifestação, acompanhamento, opinião): não há sessão para o envelope de escrita " +
    "autenticada. A defesa contra repetição é do domínio — quota por origem, uma raiz de opinião por token, " +
    "acompanhamento só lê. Pendência OUVIDORIA-REENVIO-DUPLICA (um duplo envio antes da resposta registra duas manifestações).",
};

/**
 * ⚠️ V4 (§10): A PRIMEIRA VERSÃO SÓ OLHAVA `actions.ts` — e `app/(areas)/despesa/anular-actions.ts`
 * (e o gêmeo da receita) ficaram de fora: o percurso da cadeia da despesa acusou "COMANDO SEM
 * CHAVE" ao anular um pagamento. A propriedade é "toda Server Action de app/", e Server Action
 * é o que carrega a diretiva `"use server"` — no arquivo ou na função. É isso que se varre.
 */
export function acoesDoServidor(fonte: string): number {
  const linhas = fonte.split("\n");
  const primeiraNaoVazia = linhas.find((l) => l.trim() !== "" && !l.trim().startsWith("//") && !l.trim().startsWith("/*") && !l.trim().startsWith("*")) ?? "";
  if (/^["']use server["'];?$/.test(primeiraNaoVazia.trim())) {
    return (fonte.match(/^export async function/gm) ?? []).length;
  }
  // Diretiva por função: cada `"use server";` dentro de um corpo é uma action.
  return (fonte.match(/^\s+["']use server["'];/gm) ?? []).length;
}

describe("a chave de comando cobre os chamadores", () => {
  it("t1: todo formulário de ação em app/(areas) e no molde manda <ChaveDeComando />, um por formulário", () => {
    const fontes = [...arquivos(`${RAIZ}app/(areas)`, (n) => n.endsWith(".tsx")), `${RAIZ}components/molde/FormularioDeRecurso.tsx`];
    const faltando: string[] = [];
    for (const f of fontes) {
      const b = balancoDaChave(readFileSync(f, "utf8"));
      if (b.formularios !== b.chaves) faltando.push(`${f.slice(RAIZ.length)}: ${b.formularios} formulário(s) de ação, ${b.chaves} chave(s)`);
    }
    expect(
      faltando,
      "\n\nFORMULÁRIO SEM CHAVE DE COMANDO: o servidor vai recusar o envio. Acrescente <ChaveDeComando /> dentro do <form>.\n\n"
    ).toEqual([]);
  });

  it("t2: toda Server Action de app/ (todo arquivo com \"use server\") passa por comComandoDoFormulario — ou declara aqui por que não", () => {
    const fontes = arquivos(`${RAIZ}app`, (n) => n.endsWith(".ts") || n.endsWith(".tsx")).filter((f) => /["']use server["']/.test(readFileSync(f, "utf8")));
    const faltando: string[] = [];
    let actions = 0;
    for (const f of fontes) {
      const rel = f.slice(RAIZ.length);
      const fonte = readFileSync(f, "utf8");
      const exportadas = acoesDoServidor(fonte);
      actions += exportadas;
      const comandos = (fonte.match(/comComandoDoFormulario\(/g) ?? []).length;
      if (exportadas !== comandos && ACOES_SEM_COMANDO[rel] === undefined) faltando.push(`${rel}: ${exportadas} action(s), ${comandos} com comando`);
    }
    expect(faltando).toEqual([]);
    expect(fontes.length).toBeGreaterThan(40);
    // Os que estão fora de `actions.ts` são justamente os que a primeira versão não via.
    expect(fontes.some((f) => f.endsWith("anular-actions.ts"))).toBe(true);
    expect(actions).toBeGreaterThan(fontes.length);
  });

  it("t2b: o instrumento acusa — conta actions com diretiva de arquivo e com diretiva de função", () => {
    expect(acoesDoServidor('"use server";\n\nexport async function a() {}\nexport async function b() {}\n')).toBe(2);
    expect(acoesDoServidor('import x from "y";\n\nasync function a() {\n  "use server";\n}\nexport default function P() {}\n')).toBe(1);
    expect(acoesDoServidor('// comentário\n"use server";\nexport async function a() {}\n')).toBe(1);
  });

  it("t3: o instrumento acusa — um formulário de ação sem a chave é apontado; um GET não conta", () => {
    expect(balancoDaChave('<form action={criar}>\n<input name="a" />\n</form>')).toEqual({ formularios: 1, chaves: 0 });
    expect(balancoDaChave('<form action={criar}>\n<ChaveDeComando />\n</form>')).toEqual({ formularios: 1, chaves: 1 });
    expect(balancoDaChave('<form method="get" action="/x">\n</form>')).toEqual({ formularios: 0, chaves: 0 });
    expect(ehFormularioDeAcao('<form\n  action={acao}\n  className="x">')).toBe(true);
  });
});
