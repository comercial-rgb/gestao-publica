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
};

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

  it("t2: toda Server Action de app/ passa por comComandoDoFormulario — ou declara aqui por que não", () => {
    const fontes = arquivos(`${RAIZ}app`, (n) => n === "actions.ts");
    const faltando: string[] = [];
    for (const f of fontes) {
      const rel = f.slice(RAIZ.length);
      const fonte = readFileSync(f, "utf8");
      const exportadas = (fonte.match(/^export async function/gm) ?? []).length;
      const comandos = (fonte.match(/comComandoDoFormulario\(/g) ?? []).length;
      if (exportadas !== comandos && ACOES_SEM_COMANDO[rel] === undefined) faltando.push(`${rel}: ${exportadas} exportada(s), ${comandos} com comando`);
    }
    expect(faltando).toEqual([]);
    expect(fontes.length).toBeGreaterThan(40);
  });

  it("t3: o instrumento acusa — um formulário de ação sem a chave é apontado; um GET não conta", () => {
    expect(balancoDaChave('<form action={criar}>\n<input name="a" />\n</form>')).toEqual({ formularios: 1, chaves: 0 });
    expect(balancoDaChave('<form action={criar}>\n<ChaveDeComando />\n</form>')).toEqual({ formularios: 1, chaves: 1 });
    expect(balancoDaChave('<form method="get" action="/x">\n</form>')).toEqual({ formularios: 0, chaves: 0 });
    expect(ehFormularioDeAcao('<form\n  action={acao}\n  className="x">')).toBe(true);
  });
});
