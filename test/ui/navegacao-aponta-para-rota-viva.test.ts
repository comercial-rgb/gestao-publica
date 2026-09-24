import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as navegacao from "../../lib/navegacao.js";

/**
 * ═══ TODO DESTINO DECLARADO EM `lib/navegacao.ts` TEM DE EXISTIR COMO ROTA ═══
 *
 * ⚠️ O CASO QUE CRIOU ESTA GUARDA (V11 V9.2, ao auditar `38c4f2a`). Até aquele commit, a landing
 * da folha mantinha uma lista de cards escrita à mão, PARALELA a `lib/navegacao.ts`. As duas
 * divergiram e quatro telas prontas — encargos, grupos de empenho, designações, eSocial — ficaram
 * invisíveis por um ano de commits. O conserto foi certo: a landing passou a DERIVAR de
 * `navegacao.ts`, e lista derivada não pode divergir.
 *
 * Só que ele trocou o defeito de lado. Enquanto a landing tinha lista própria, um `href` errado em
 * `navegacao.ts` afetava só o submenu. Agora ele vira um CARD NA LANDING — a porta por onde o
 * servidor municipal entra — que leva a 404. É "botão sem handler" pela porta dos fundos, e este
 * repositório proíbe botão sem handler. Nenhum teste cobria isso: varri `test/` inteiro e
 * `descritores-consistentes.test.ts` confere DESCRITORES (importando cada módulo), não rotas.
 *
 * ═══ ⚠️ O QUE SE AFIRMA AQUI É UMA PROPRIEDADE, NÃO UMA LISTA ═══
 *
 * Seria fácil e quase inútil escrever "as nove rotas da folha existem". Isso passaria a valer no
 * dia em que alguém acrescentasse a décima, e continuaria verde. *Guarda que enumera formas acha
 * só aquelas formas.*
 *
 * As duas pontas são varridas, e nenhuma é enumerada:
 *   · O DESTINO: percorre-se TODO export de `lib/navegacao.ts`, recursivamente, recolhendo
 *     qualquer campo `href`/`rota` que seja caminho absoluto — e também as CHAVES de mapas que
 *     sejam caminho (`RELACOES_RREO` indexa por rota, e uma chave morta faz o rodapé "Ver também"
 *     sumir em silêncio). Constante nova entra sozinha; ninguém precisa lembrar de listá-la aqui.
 *   · A ROTA: percorre-se a árvore de `app/` recolhendo todo `page.tsx`, com os segmentos de GRUPO
 *     (`(areas)`, `(publico)`) removidos — que é exatamente o que o Next faz para formar a URL.
 *     Grupo novo passa a valer sozinho.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const APP = join(RAIZ, "app");

/** Todo `page.tsx` sob `app/`, como a ROTA que o Next serve. */
function rotasServidas(dir: string, prefixo: string, achadas: Set<string>): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // ⚠️ SEGMENTO DE GRUPO NÃO ENTRA NA URL. `app/(areas)/folha` é servido em `/folha`. Tratar
      // "(areas)" como segmento faria TODA rota da área parecer inexistente — o teste ficaria
      // vermelho por falha própria, que é o pior jeito de um instrumento morrer.
      const segmento = e.name.startsWith("(") && e.name.endsWith(")") ? "" : `/${e.name}`;
      rotasServidas(join(dir, e.name), `${prefixo}${segmento}`, achadas);
      continue;
    }
    if (e.name === "page.tsx") achadas.add(prefixo === "" ? "/" : prefixo);
  }
}

/**
 * Casa um destino contra as rotas servidas, aceitando segmento DINÂMICO (`[id]`, `[...slug]`).
 * Hoje nenhum destino de `navegacao.ts` é dinâmico; o ramo existe para que o primeiro que for não
 * apareça como rota morta.
 */
function existe(destino: string, rotas: ReadonlySet<string>): boolean {
  if (rotas.has(destino)) return true;
  const partes = destino.split("/").filter((p) => p !== "");
  for (const rota of rotas) {
    const alvo = rota.split("/").filter((p) => p !== "");
    const pegaTudo = alvo.some((s) => s.startsWith("[..."));
    if (!pegaTudo && alvo.length !== partes.length) continue;
    let bate = true;
    for (let i = 0; i < alvo.length; i += 1) {
      const s = alvo[i]!;
      if (s.startsWith("[...")) return true;
      if (s.startsWith("[") && s.endsWith("]")) continue;
      if (s !== partes[i]) {
        bate = false;
        break;
      }
    }
    if (bate && alvo.length === partes.length) return true;
  }
  return false;
}

/** Todo destino declarado, com o caminho de onde ele veio — para a falha dizer ONDE consertar. */
function destinosDeclarados(valor: unknown, onde: string, achados: Map<string, string>): void {
  if (valor === null || valor === undefined) return;
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => destinosDeclarados(v, `${onde}[${i}]`, achados));
    return;
  }
  if (typeof valor !== "object") return;
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    // A CHAVE também é destino quando o mapa indexa por rota (`RELACOES_RREO`).
    if (chave.startsWith("/") && !achados.has(chave)) achados.set(chave, `${onde} (chave)`);
    if ((chave === "href" || chave === "rota") && typeof v === "string" && v.startsWith("/")) {
      if (!achados.has(v)) achados.set(v, `${onde}.${chave}`);
      continue;
    }
    destinosDeclarados(v, `${onde}.${chave}`, achados);
  }
}

describe("navegação aponta para rota viva", () => {
  const rotas = new Set<string>();
  rotasServidas(APP, "", rotas);

  const destinos = new Map<string, string>();
  for (const [nome, valor] of Object.entries(navegacao)) destinosDeclarados(valor, nome, destinos);

  /**
   * ⚠️ AS DUAS VARREDURAS TÊM DE TER ACHADO ALGO, e isto não é zelo: um `readdirSync` sobre a pasta
   * errada, ou um `Object.entries` sobre um módulo que deixou de exportar dados, devolveria
   * conjuntos VAZIOS — e o teste abaixo passaria por VACUIDADE, verde e cego, exatamente o modo
   * como um instrumento morre sem ninguém notar. Os pisos são frouxos de propósito: eles afirmam
   * "a varredura funcionou", não "o sistema tem este tamanho".
   */
  it("as varreduras acharam as duas pontas (senão o teste abaixo passa por vacuidade)", () => {
    expect(rotas.size).toBeGreaterThan(100);
    expect(destinos.size).toBeGreaterThan(100);
    // e a varredura de rotas de fato remove os segmentos de grupo
    expect([...rotas].some((r) => r.includes("("))).toBe(false);
  });

  it("todo href/rota declarado em lib/navegacao.ts corresponde a uma rota existente em app/", () => {
    const mortos = [...destinos.entries()]
      .filter(([destino]) => !existe(destino, rotas))
      .map(([destino, onde]) => `${destino}  ← declarado em ${onde}`)
      .sort();
    expect(
      mortos,
      "\n\nNAVEGAÇÃO APONTA PARA O NADA — a landing deriva de `lib/navegacao.ts` (commit 38c4f2a),\n" +
        "então cada destino abaixo é um CARD que leva a 404: botão sem handler.\n" +
        "Ou a rota foi renomeada/removida sem atualizar a navegação, ou a tela ainda não existe\n" +
        "(e então o destino não deve ser declarado antes dela).\n\n"
    ).toEqual([]);
  });
});
