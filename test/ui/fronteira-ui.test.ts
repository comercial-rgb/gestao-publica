import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O GREP-TESTE DA FRONTEIRA UI ↔ DOMÍNIO — agora TRIVALENTE (a borda ganhou uma porta).
 *
 * ═══ ⚠️ TRÊS ZONAS, TRÊS REGRAS ═══
 * A camada de apresentação (`app/**`, `components/**`, `lib/**`) conversa com o domínio por UMA
 * borda só: as PORTAS (`lib/portas/**`). É na porta que, nas próximas fatias, entram a sessão
 * (6.3), a autorização (6.4) e a segregação por UG (6.5). As três regras que mantêm isso:
 *
 *   (1) UI (app/**, components/**, lib/** EXCETO lib/portas/**) NÃO importa o domínio (M01-M16)
 *       nem o Prisma. Um `import { anexo3 } from "modules/m12..."` numa tela pularia a porta.
 *   (2) PORTAS (lib/portas/**) PODEM importar o domínio e o Prisma — é a função delas — mas NÃO
 *       importam a UI (components/**): a porta é dado, não pixel. Import de componente numa porta
 *       inverteria a dependência (o dado passaria a depender da tela).
 *   (3) Uma ilha CLIENT (`"use client"`) NÃO importa uma porta: a porta puxa o Prisma, que não
 *       bundla para o browser. A leitura mora no Server Component; o client recebe já-lido.
 *
 * O compilador não pega nada disso (são imports válidos); este grep pega, nomeando o arquivo. É a
 * mesma anatomia do grep-teste do funil e do censo.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const PASTAS_UI = ["app", "components", "lib"];

function varrer(dir: string, achados: string[]): void {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // pasta ausente (ex.: build limpo) — não é falha do teste
  }
  for (const e of entradas) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      varrer(p, achados);
      continue;
    }
    if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) achados.push(p);
  }
}

/** Caminho relativo à raiz, com barras normais. */
function relDe(abs: string): string {
  return abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
}

/** As linhas que NÃO são comentário (o teste se descreve nos comentários dos arquivos). */
function linhasEfetivas(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

/** Imports proibidos na UI (zona 1). */
const PROIBIDOS_UI: readonly { readonly re: RegExp; readonly nome: string }[] = [
  { re: /from\s+["'][^"']*\bmodules\/m\d+/, nome: "um módulo de domínio (modules/mNN)" },
  // ⚠️ OS ADAPTERS DE TRIBUNAL SÃO DOMÍNIO TAMBÉM. O SAGRES (M15), o Captura (M18) e a Consulta
  // (M19) saíram de `modules/mNN/` para `adapters/tribunais/<tribunal>/` — e a regra acima, que
  // casa por `modules/mNN`, deixou de alcançá-los. Sem esta linha o grep continuaria PASSANDO
  // enquanto a fronteira que ele existe para defender ficava aberta: uma tela poderia importar o
  // gerador SAGRES direto, pulando a porta, e nenhum teste reclamaria. Guarda que silenciosamente
  // para de guardar é pior que guarda nenhum, porque ninguém vai conferir de novo.
  {
    re: /from\s+["'][^"']*\badapters\/tribunais\//,
    nome: "um adapter de tribunal (adapters/tribunais/**)",
  },
  { re: /from\s+["']@prisma\//, nome: "@prisma/*" },
  { re: /from\s+["'][^"']*prisma\/generated/, nome: "o client Prisma gerado" },
];

/** Import proibido numa PORTA (zona 2): a porta não conhece a UI. */
const PROIBIDO_PORTA = {
  re: /from\s+["'][^"']*\/components\//,
  nome: "um componente de UI (components/**) — a porta é dado, não pixel",
};

/** Import proibido numa ilha CLIENT (zona 3): o client não puxa a porta (Prisma não vai ao browser). */
const PROIBIDO_CLIENT_PORTA = {
  re: /from\s+["'][^"']*\/lib\/portas\//,
  nome: "uma porta (lib/portas/**) dentro de um componente client — a porta puxa o Prisma",
};

const ehPorta = (rel: string): boolean => rel.startsWith("lib/portas/");
const ehClient = (conteudo: string): boolean =>
  /^\s*["']use client["']/m.test(conteudo);

describe("UI — a fronteira com o domínio (grep trivalente: UI · porta · client)", () => {
  const arquivos: string[] = [];
  for (const pasta of PASTAS_UI) {
    const abs = join(RAIZ, pasta);
    try {
      if (statSync(abs).isDirectory()) varrer(abs, arquivos);
    } catch {
      /* pasta opcional */
    }
  }

  it("(1) a UI (fora de lib/portas) NÃO importa módulos de domínio nem Prisma", () => {
    expect(arquivos.length).toBeGreaterThan(0); // a UI existe

    const infratores: string[] = [];
    for (const abs of arquivos) {
      const rel = relDe(abs);
      if (ehPorta(rel)) continue; // a porta é a exceção; ela tem sua própria regra em (2)
      const efetivo = linhasEfetivas(readFileSync(abs, "utf8"));
      for (const { re, nome } of PROIBIDOS_UI) {
        if (re.test(efetivo)) infratores.push(`${rel}  → importa ${nome}`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ A FRONTEIRA UI↔DOMÍNIO FOI FURADA.\n\n" +
        "Um arquivo de UI (app/components/lib, fora de lib/portas) importou um módulo de domínio " +
        "(M01-M16) ou o Prisma direto. A UI conversa com o domínio SÓ por PORTAS, e é na porta que " +
        "a autorização (6.4) e a segregação por UG (6.5) valem. Mova a leitura para uma porta e " +
        "importe a PORTA. Infratores:\n"
    ).toEqual([]);
  });

  it("(2) uma porta (lib/portas/**) PODE ler o domínio, mas NÃO importa a UI", () => {
    const portas = arquivos.filter((a) => ehPorta(relDe(a)));
    // a existência de ao menos uma porta é o sinal de que a borda nasceu.
    expect(portas.length).toBeGreaterThan(0);

    const infratores: string[] = [];
    for (const abs of portas) {
      const efetivo = linhasEfetivas(readFileSync(abs, "utf8"));
      if (PROIBIDO_PORTA.re.test(efetivo)) {
        infratores.push(`${relDe(abs)}  → importa ${PROIBIDO_PORTA.nome}`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ UMA PORTA IMPORTOU A UI.\n\n" +
        "Uma porta é a camada de DADO (lê o domínio, devolve tipos). Importar um componente de " +
        "UI inverte a dependência — o dado passaria a depender do pixel. Deixe a porta pura.\n"
    ).toEqual([]);
  });

  it("(3) um componente client (\"use client\") NÃO importa uma porta", () => {
    const infratores: string[] = [];
    for (const abs of arquivos) {
      const rel = relDe(abs);
      if (ehPorta(rel)) continue;
      const conteudo = readFileSync(abs, "utf8");
      if (!ehClient(conteudo)) continue;
      if (PROIBIDO_CLIENT_PORTA.re.test(linhasEfetivas(conteudo))) {
        infratores.push(`${rel}  → importa ${PROIBIDO_CLIENT_PORTA.nome}`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ UMA ILHA CLIENT IMPORTOU UMA PORTA.\n\n" +
        "A porta puxa o Prisma, que NÃO bundla para o browser — o build quebraria (ou pior, " +
        "vazaria DATABASE_URL). A leitura mora no Server Component; passe o dado já-lido como prop " +
        "para a ilha client. Infratores:\n"
    ).toEqual([]);
  });
});
