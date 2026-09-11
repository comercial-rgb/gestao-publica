import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DIRETORIOS_INERTES, RAIZES_DE_CODIGO, raizesExistentes } from "./raizes-dominio.js";

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

// ⚠️ `DIRETORIOS_INERTES` ENTRA AQUI MESMO SEM SER ALCANÇÁVEL HOJE, e a razão é a
// promessa deste arquivo: a união das duas partições é o conjunto INTEIRO dos testes. Se
// um dia `doador` entrasse em `RAIZES_DE_CODIGO`, os 10 `.test.ts` do folha-engine
// absorvido entrariam na conta — e `particao-da-suite.test.ts` os cobraria de uma das duas
// partições. Esta linha é o que impede a promessa de passar a valer para código de
// terceiro que não tem banco de teste, `setup.ts` nem intenção de rodar.
const IGNORAR = new Set([
  "node_modules",
  "generated",
  ".git",
  ".next",
  "dist",
  ...DIRETORIOS_INERTES,
]);

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
 *
 * ═══ ⚠️ E ELE VOLTOU A ESTOURAR, EXATAMENTE COMO ESTE PARÁGRAFO PREVIU ═══
 *
 * No portão de 2026-09-11 o teste morreu por TIMEOUT em 6.072 ms — não por asserção. A
 * causa foi medida antes de qualquer conserto: a primeira chamada de `particionar` custava
 * **3.824 ms**, e as seguintes 5 ms. A memoização estava funcionando; o que não cabia mais
 * era a PRIMEIRA chamada, a 24% do teto de 5 s, num custo que cresce com o repositório.
 *
 * ⚠️ O DEGRAU QUE FALTAVA ERA A ARESTA. Memorizava-se o conteúdo lido e a resolução de cada
 * especificador, mas NÃO a lista de arestas do arquivo: `caminhar` mantém `vistos` por
 * chamada, então um nó alcançado a partir de 100 testes tinha o `matchAll(IMPORT)`
 * reexecutado 100 vezes sobre o mesmo texto já em memória. O `packages/contracts/index.ts`
 * do parágrafo acima parou de ser RESOLVIDO centenas de vezes e continuou sendo VARRIDO
 * centenas de vezes.
 *
 * Com `arestas` memorizado por (arquivo, raiz), a regex roda uma vez por arquivo em vez de
 * uma vez por par (teste, arquivo). A primeira chamada cai de 3.824 ms para o que a medição
 * registrar no commit — e o conserto continua sendo memória, não timeout maior.
 */
const resolucoes = new Map<string, string | null>();
const fontes = new Map<string, string | null>();
const alcanca = new Map<string, boolean>();
const arestas = new Map<string, readonly string[]>();

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
    for (const alvo of arestasDe(atual, raiz)) fila.push(alvo);
  }
  return false;
}

/** Os arquivos que `arquivo` importa por caminho relativo — varrido UMA vez por arquivo. */
function arestasDe(arquivo: string, raiz: string): readonly string[] {
  const chave = `${raiz}\u0000${arquivo}`;
  const memo = arestas.get(chave);
  if (memo !== undefined) return memo;

  const fonte = lerMemo(join(raiz, arquivo));
  const achadas: string[] = [];
  if (fonte !== null) {
    for (const m of fonte.matchAll(IMPORT)) {
      const alvo = resolverRelativo(arquivo, m[1]!, raiz);
      if (alvo !== null) achadas.push(alvo);
    }
  }
  arestas.set(chave, achadas);
  return achadas;
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
