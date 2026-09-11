import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { RAIZES_DE_CODIGO, raizesExistentes } from "./raizes-dominio.js";

/**
 * ═══ A PARTIÇÃO DA SUÍTE — RÁPIDA E COMPLETA, E A CONTA FECHA ═══
 *
 * 167 arquivos e 1.700 testes levam ~390 s numa máquina de 8 GB que já roda no teto. Rodar
 * tudo a cada edição custa mais do que a edição, e o que custa demais passa a não ser
 * rodado — que é o pior dos dois mundos.
 *
 * ⚠️ É DECISÃO DE AGENDAMENTO, NÃO DE RIGOR. Nada sai da suíte: a rápida roda a cada
 * mudança, a completa roda no gate, e a UNIÃO das duas é o conjunto inteiro — o que este
 * arquivo define e `particao-da-suite.test.ts` prova. Uma partição que perde um arquivo é
 * a mesma armadilha do `test/` fora do tsconfig: verde que não rodou nada.
 *
 * O CORTE É O BANCO. Um teste que abre conexão, aplica migration, limpa e semeia tabela
 * paga segundos; um teste de domínio puro paga milissegundos. O corte não é por módulo nem
 * por lista escrita à mão — é pelo que o arquivo IMPORTA, direta ou transitivamente.
 */

/** Os `include` da suíte — UM lugar só, lido pelas duas configurações. */
export const INCLUDE_DA_SUITE: readonly string[] = [
  "packages/**/*.test.ts",
  "modules/**/*.test.ts",
  "adapters/**/*.test.ts",
  "prisma/seed/**/*.test.ts",
  "test/**/*.test.ts",
  "test/**/*.test.tsx",
];

/**
 * Os módulos que SÓ existem com banco. Alcançar qualquer um deles — por qualquer cadeia de
 * imports relativos — põe o arquivo na partição lenta.
 */
export const PORTAS_DO_BANCO: readonly string[] = [
  "test/banco.ts",
  "test/db-teste.ts",
  "test/limpar-banco.ts",
  "test/usuarios-teste.ts",
  "test/ficha-teste.ts",
  "test/roteiro-orcamentario.ts",
];

const IGNORAR = new Set(["node_modules", "generated", ".git", ".next", "dist"]);

/** Todo arquivo de teste do repositório, em caminho relativo com "/". */
export function arquivosDeTeste(raiz: string): readonly string[] {
  const achados: string[] = [];
  const andar = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORAR.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        andar(p);
        continue;
      }
      if (/\.test\.tsx?$/.test(e.name)) achados.push(relative(raiz, p).replace(/\\/g, "/"));
    }
  };
  // ⚠️ AS RAÍZES VÊM DE `raizes-dominio.ts`. Escritas à mão aqui, a partição pararia de
  // enxergar o diretório de domínio que nascesse depois — e o modo de falha seria o pior:
  // os testes daquele diretório sumiriam das DUAS partições, em silêncio, com tudo verde.
  // O `raizes-dominio.test.ts` acusou exatamente isto na primeira versão deste arquivo.
  for (const dir of raizesExistentes(raiz, RAIZES_DE_CODIGO)) andar(dir);
  return [...new Set(achados)].sort();
}

const IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;

/**
 * ⚠️ MEMÓRIA, E NÃO TIMEOUT MAIOR. A primeira versão levava **3,6 s** por chamada e
 * estourava o limite de 5 s do vitest na partição paralela. A causa foi MEDIDA, e é a
 * resolução repetida: cada um dos 169 arquivos de teste caminha sobre o mesmo grafo de
 * imports, e `resolverRelativo` fazia até quatro `statSync` por especificador — o
 * `packages/contracts/index.ts` era resolvido centenas de vezes.
 *
 * Memorizado por (arquivo, especificador) e por conteúdo lido, cai para milissegundos.
 * Aumentar o timeout teria escondido um custo que é O(arquivos × grafo) e que voltaria a
 * estourar no próximo módulo — timeout se mede e se memoiza, não se aumenta.
 */
const resolucoes = new Map<string, string | null>();
const fontes = new Map<string, string | null>();
const alcanca = new Map<string, boolean>();

/** Resolve um especificador relativo em ESM (`./x.js`) para o arquivo `.ts`/`.tsx` real. */
function resolverRelativo(deArquivo: string, espec: string, raiz: string): string | null {
  const chave = `${deArquivo}\u0000${espec}`;
  const memo = resolucoes.get(chave);
  if (memo !== undefined) return memo;
  const achado = resolverSemMemoria(deArquivo, espec, raiz);
  resolucoes.set(chave, achado);
  return achado;
}

function resolverSemMemoria(deArquivo: string, espec: string, raiz: string): string | null {
  const base = resolve(raiz, deArquivo, "..", espec).replace(/\\/g, "/");
  const semExt = base.replace(/\.js$/, "");
  for (const tentativa of [`${semExt}.ts`, `${semExt}.tsx`, `${semExt}/index.ts`, base]) {
    try {
      if (statSync(tentativa).isFile()) return relative(raiz, tentativa).replace(/\\/g, "/");
    } catch {
      /* tentativa seguinte */
    }
  }
  return null;
}

/**
 * O arquivo alcança alguma porta do banco? Caminhamento transitivo pelos imports RELATIVOS.
 *
 * ⚠️ SÓ OS RELATIVOS, e de propósito: `@prisma/client` aparece como TIPO em quase todo
 * módulo de domínio, e segui-lo poria a suíte inteira na partição lenta. O que caracteriza o
 * teste de integração não é mencionar o tipo do client — é montar o banco.
 */
function lerMemo(abs: string): string | null {
  const memo = fontes.get(abs);
  if (memo !== undefined) return memo;
  let conteudo: string | null;
  try {
    conteudo = readFileSync(abs, "utf8");
  } catch {
    conteudo = null;
  }
  fontes.set(abs, conteudo);
  return conteudo;
}

export function precisaDeBanco(arquivo: string, raiz: string): boolean {
  // A chave inclui a raiz: memorizar só pelo arquivo daria a resposta de OUTRO repositório
  // se alguém chamasse isto para duas árvores no mesmo processo.
  const chave = `${raiz}\u0000${arquivo}`;
  const memo = alcanca.get(chave);
  if (memo !== undefined) return memo;
  const resposta = caminhar(arquivo, raiz);
  alcanca.set(chave, resposta);
  return resposta;
}

function caminhar(arquivo: string, raiz: string): boolean {
  const portas = new Set(PORTAS_DO_BANCO);
  const vistos = new Set<string>();
  const fila = [arquivo];
  while (fila.length > 0) {
    const atual = fila.pop()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    if (portas.has(atual)) return true;
    const fonte = lerMemo(join(raiz, atual));
    if (fonte === null) continue;
    for (const m of fonte.matchAll(IMPORT)) {
      const alvo = resolverRelativo(atual, m[1]!, raiz);
      if (alvo !== null) fila.push(alvo);
    }
  }
  return false;
}

/** A partição: `{ rapida, lenta }`, e a união é `arquivosDeTeste`. */
export function particionar(raiz: string): {
  readonly rapida: readonly string[];
  readonly lenta: readonly string[];
} {
  const rapida: string[] = [];
  const lenta: string[] = [];
  for (const a of arquivosDeTeste(raiz)) {
    (precisaDeBanco(a, raiz) ? lenta : rapida).push(a);
  }
  return { rapida, lenta };
}
