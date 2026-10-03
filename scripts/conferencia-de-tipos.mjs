import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ═══ A CONFERÊNCIA DE TIPOS SEPARADA, E A PROVA QUE A AMARRA AO CONTEÚDO (V9 N0) ═══
 *
 * ⚠️ O PROBLEMA QUE ISTO RESOLVE. `next build` confere tipos num worker próprio, e num
 * ambiente com pouca memória esse worker MORRE — SIGABRT, sem mensagem —, caso em que a
 * saída de `npm run typecheck:app` (o MESMO tsconfig, o MESMO `.next/types`) é a forma de
 * conferir os tipos do app sem derrubar o build.
 *
 * ⚠️ O QUE ESTE CABEÇALHO DIZIA ATÉ 24/09/2026 ERA FALSO, e a correção é por medição. Ele
 * afirmava que o worker de tipos "não herda o `--max-old-space-size` do repositório". No
 * Next 15.5.20 ele HERDA: `next/dist/lib/worker.js` repassa `process.env.NODE_OPTIONS` ao
 * filho e só apaga o `max-old-space-size` quando `isolatedMemory: true` — que é o worker de
 * PÁGINAS (`build/index.js:338`), não o de TIPOS (`build/type-check.js:77`, com
 * `isolatedMemory: false`). Medido em 24/09/2026 nesta máquina, nas duas direções:
 * `isolatedMemory:false` + `NODE_OPTIONS=--max-old-space-size=5324` dá heap de 5372 MB no
 * worker; `isolatedMemory:true` com o mesmo NODE_OPTIONS dá 2096 MB; sem NODE_OPTIONS, 2096 MB.
 *
 * ⚠️ POR ISSO A VÁLVULA NÃO É O CAMINHO NORMAL DESTA MÁQUINA — é o instrumento para a máquina
 * MENOR. Onde o heap couber, builde com `NODE_OPTIONS` exportado e deixe o próprio build
 * conferir: ele confere o `.next/types/**` DESTA build, e o `typecheck:app` confere o da
 * anterior. A válvula existe para quando o worker não tiver memória para terminar.
 *
 * ⚠️ MAS "eu rodei o typecheck antes" NÃO É PROVA. Um `PULAR_CONFERENCIA_DO_BUILD=1` no
 * ambiente aprova qualquer build futuro, de qualquer conteúdo, para sempre — inclusive o
 * build de amanhã, com arquivos que ninguém conferiu. E o SHA do commit também não serve:
 * a árvore desta sessão tem alterações não commitadas, e dois conteúdos diferentes moram
 * sob o mesmo SHA.
 *
 * ⚠️ POR ISSO A APROVAÇÃO É PELO CONTEÚDO EXATO. O digesto abaixo cobre tudo que muda o
 * resultado do `tsc` sobre `tsconfig.json`: os fontes que o `include` alcança, o próprio
 * `tsconfig.json`, o `next.config.mjs`, o `package-lock.json` (que fixa as versões dos
 * tipos de terceiro) e **os tipos gerados do Prisma que estão em disco**. Muda qualquer um
 * deles, muda o digesto, e a aprovação anterior deixa de valer — sem ninguém precisar
 * lembrar de apagá-la.
 *
 * ⚠️ E O INVENTÁRIO FICA GUARDADO ARQUIVO A ARQUIVO, não só o digesto. Quando a aprovação
 * não casa, o motivo é uma LISTA DE ARQUIVOS — "estes onze mudaram" —, que é o que permite
 * "verificar novamente a parte necessária" em vez de reconferir o mundo.
 *
 * ⚠️ O QUE ELE NÃO PROVA, DITO EM VOZ ALTA: lint. Este repositório não tem ESLint instalado
 * (conferido em 15/09/2026: nenhuma configuração, nenhuma dependência). A válvula do
 * `next.config.mjs` trata as duas decisões SEPARADAMENTE justamente por isso — tipo
 * aprovado não é lint aprovado, e um único interruptor para as duas coisas fazia uma
 * conferência que aconteceu carregar outra que nunca existiu.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA_DE_APROVACOES = join(RAIZ, ".registro-de-execucao", "conferencia-de-tipos");

/**
 * AS RAÍZES QUE O `tsconfig.json` ALCANÇA. Não é uma lista de conveniência: é o `include`
 * daquele arquivo, traduzido. Quando o `include` mudar, o `tsconfig.json` entra no digesto
 * pelo próprio conteúdo — a aprovação cai junto, e é este comentário que se relê.
 */
const RAIZES_DE_FONTE = ["app", "components", "lib"];
const ARQUIVOS_AVULSOS = [
  "tsconfig.json",
  "next.config.mjs",
  "next-env.d.ts",
  "middleware.ts",
  "package-lock.json",
];
/** Os tipos GERADOS que o app consome. Sem eles no digesto, um `prisma generate` com
 *  schema novo passaria despercebido por uma aprovação velha. */
const RAIZES_GERADAS = ["prisma/generated/client"];

function sha256(b) {
  return createHash("sha256").update(b).digest("hex");
}

function* varrer(dir) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* varrer(p);
    // ⚠️ SEMPRE COM "/": no Windows o `join` devolve "\", e o digesto de uma aprovação feita aqui não
    // batia com o mesmo conteúdo num servidor Linux — todos os arquivos apareciam como "novo" (V29, EC2).
    // O inventário de rotas, que filtra por "/", também saía vazio no Windows.
    else if (/\.(ts|tsx)$/.test(e.name)) yield p.split("\\").join("/");
  }
}

/**
 * O conteúdo com as quebras de linha normalizadas para LF. O Next gera o next-env.d.ts com CRLF no
 * Windows e LF no Linux: o mesmo arquivo dava digestos diferentes, e a aprovação feita na máquina de
 * construção não valia no servidor (V29, EC2). Quebra de linha não muda tipo nenhum.
 */
function conteudoNormalizado(f) {
  return readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
}

/** O inventário: caminho relativo -> sha256 do conteúdo. Ordenado, para ser estável. */
export function inventarioDeTipos() {
  const inv = {};
  for (const raiz of [...RAIZES_DE_FONTE, ...RAIZES_GERADAS])
    for (const f of varrer(raiz)) inv[f] = sha256(conteudoNormalizado(f));
  for (const f of ARQUIVOS_AVULSOS)
    if (existsSync(join(RAIZ, f))) inv[f] = sha256(conteudoNormalizado(f));
  return Object.fromEntries(Object.entries(inv).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * O INVENTÁRIO DE ROTAS, à parte do digesto e por um motivo.
 *
 * ⚠️ `.next/types/**` é GERADO PELO PRÓPRIO BUILD, e entra no `include` do `tsconfig.json`.
 * Pô-lo no digesto criaria uma cobra que morde o rabo: o build que produz os tipos
 * invalidaria a aprovação que autoriza o build. O que determina aqueles tipos são os
 * ARQUIVOS DE ROTA — e esses já estão no digesto, um a um, por estarem sob `app/`.
 *
 * Este inventário serve para DIZER, na evidência, qual era o conjunto de rotas no momento
 * da conferência. Rota nova, removida ou renomeada muda o arquivo, muda o digesto, e a
 * aprovação cai — que é a garantia pedida de que os tipos de rota conferidos são os das
 * rotas finais.
 */
export function inventarioDeRotas() {
  return [...varrer("app")].filter((f) => /\/(page|layout|route|template|error|loading|not-found)\.tsx?$/.test(f)).sort();
}

export function digestoDeTipos() {
  const inventario = inventarioDeTipos();
  const linhas = Object.entries(inventario).map(([f, h]) => `${f} ${h}`).join("\n");
  return { digesto: sha256(linhas), inventario };
}

function caminhoDaAprovacao(digesto) {
  return join(PASTA_DE_APROVACOES, `${digesto}.json`);
}

/**
 * ═══ O HEAP DIMENSIONADO PELA MÁQUINA, NÃO CRAVADO (V9 N0.5) ═══
 * `5120` era um número escrito à mão para ESTA máquina de 8 GB. Num servidor de 2 GB ele
 * pede mais memória do que existe e o processo morre por OOM do sistema — que é o modo de
 * falha que esta rodada inteira existe para parar de confundir com "erro de tipo".
 * 65% da memória total, com teto de 12 GB e piso de 1,5 GB.
 *
 * ⚠️ O TETO SUBIU DE 6 PARA 12 GB NA V29, MEDIDO: o recorte `tsconfig.app-sem-rotas.json` estourou em
 * 6.130 MB (heap de 6.144 MB, 180 s) com o `c899c6e`, e passou limpo com 14.000 MB nesta máquina de 31 GB. Em
 * máquina menor quem manda continua sendo os 65% — o teto só alcança quem tem mais de 18 GB.
 */
export function heapEmMegabytes() {
  const totalMb = Math.floor(totalmem() / (1024 * 1024));
  return Math.max(1536, Math.min(12288, Math.floor(totalMb * 0.65)));
}

/**
 * OS DOIS RECORTES DO TYPE-CHECK DO APP — e por que eles existem (V20).
 *
 * ═══ ⚠️ MEDIDO, NÃO SUPOSTO ═══
 * `tsc --noEmit -p tsconfig.json` deixou de caber nesta máquina de 8 GB. Medições da V20, com o
 * Postgres parado e o Docker encerrado (RSS total do sistema em 3.274 MB, 1,5 GB de páginas livres):
 *
 *   heap 4.400 MB -> estourou em  49 s, crescendo até 4.345 MB
 *   heap 5.324 MB -> estourou em 116 s, crescendo até 5.239 MB
 *
 * Não é pressão de memória: é TETO DE HEAP. O processo cresce até o limite e morre nele.
 *
 * ⚠️ E O CUSTO ESTÁ NOS STUBS DE ROTA GERADOS. `.next/types/**` tem 293 arquivos que o build
 * escreve, um por rota, e cada um referencia a página dele — juntos, eles puxam o grafo inteiro do
 * app de uma vez. Separados, os dois lados passam com folga no MESMO heap:
 *
 *   tsconfig.app-sem-rotas.json  (app, components, lib, middleware) -> limpo
 *   tsconfig.rotas-geradas.json  (somente .next/types/**)           -> limpo
 *
 * ⚠️ OS DOIS RODAM, E OS DOIS TÊM DE PASSAR. Aprovar com um só seria meia medição com nome de
 * medição inteira — e é exatamente o tipo de "passo pulado" que este repositório conta como passo
 * que não aconteceu. A UNIÃO dos dois `include` cobre o mesmo que o `include` do `tsconfig.json`.
 */
const RECORTES_DO_APP = ["tsconfig.app-sem-rotas.json", "tsconfig.rotas-geradas.json"];

/** Roda o `tsc` do app (nos dois recortes) e, se os dois passarem, GRAVA a aprovação. */
export function conferir() {
  const { digesto, inventario } = digestoDeTipos();
  const heap = heapEmMegabytes();

  console.error(`[tipos] digesto do conteudo: ${digesto}`);
  console.error(`[tipos] heap do tsc: ${heap} MB (memoria total ${Math.floor(totalmem() / 1024 / 1024)} MB)`);
  console.error(`[tipos] dois recortes, e os DOIS tem de passar: ${RECORTES_DO_APP.join(" + ")}`);

  const inicio = Date.now();
  for (const recorte of RECORTES_DO_APP) {
    const parcial = Date.now();
    // O `tsc` do projeto pelo MESMO node, e não `npx`: no Windows `npx` é `npx.cmd`, que o Node
    // recusa executar sem shell — o filho não nascia e a saída era "codigo null" em 3 ms.
    const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", recorte], {
      cwd: RAIZ,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heap}` },
    });
    const dt = Date.now() - parcial;
    if (r.error !== undefined) {
      console.error(`[tipos] o tsc de ${recorte} NAO INICIOU (${r.error.message}). Isto nao e aprovacao nem reprovacao.`);
      return 1;
    }
    if (r.signal !== null && r.signal !== undefined) {
      console.error(`[tipos] ⚠️ o tsc de ${recorte} foi MORTO pelo sinal ${r.signal} em ${dt} ms. Isto nao e aprovacao nem reprovacao: e execucao que nao terminou.`);
      return 128;
    }
    if (r.status !== 0) {
      console.error(`[tipos] reprovado em ${recorte} (codigo ${r.status}) apos ${dt} ms. Nenhuma aprovacao gravada.`);
      return r.status ?? 1;
    }
    console.error(`[tipos] ${recorte}: limpo em ${dt} ms.`);
  }
  const duracaoMs = Date.now() - inicio;

  mkdirSync(PASTA_DE_APROVACOES, { recursive: true });
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).stdout?.trim() ?? "(sem git)";
  const sujo = (spawnSync("git", ["status", "--porcelain"], { cwd: RAIZ, encoding: "utf8" }).stdout ?? "").trim() !== "";
  writeFileSync(
    caminhoDaAprovacao(digesto),
    JSON.stringify(
      {
        digesto,
        quando: new Date().toISOString(),
        comando: RECORTES_DO_APP.map((r) => `npx tsc --noEmit -p ${r}`).join(" && "),
        duracaoMs,
        heapMb: heap,
        node: process.version,
        // O SHA vai junto como RASTRO, e vem acompanhado de `arvoreSuja` para que ninguem
        // o leia como identificacao do conteudo: com a arvore suja, ele nao identifica nada.
        sha,
        arvoreSuja: sujo,
        arquivos: Object.keys(inventario).length,
        rotas: inventarioDeRotas(),
        inventario,
      },
      null,
      1
    )
  );
  console.error(`[tipos] APROVADO em ${duracaoMs} ms. Aprovacao gravada em ${relative(RAIZ, caminhoDaAprovacao(digesto))}`);
  return 0;
}

/**
 * Existe aprovação para O CONTEÚDO DE AGORA? Devolve `{ ok, motivo, digesto, mudaram }`.
 * Nunca lança — quem chama decide o que fazer, e o `next.config.mjs` precisa da lista.
 */
export function conferenciaAprovada() {
  const { digesto, inventario } = digestoDeTipos();
  const alvo = caminhoDaAprovacao(digesto);
  if (existsSync(alvo)) {
    const a = JSON.parse(readFileSync(alvo, "utf8"));
    return { ok: true, digesto, quando: a.quando, duracaoMs: a.duracaoMs, mudaram: [] };
  }

  // Sem casamento: descobrir QUAIS arquivos mudaram desde a aprovação mais recente, para
  // que a mensagem diga o que reconferir em vez de só "nao bate".
  let recente = null;
  if (existsSync(PASTA_DE_APROVACOES)) {
    const arqs = readdirSync(PASTA_DE_APROVACOES)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f: join(PASTA_DE_APROVACOES, f), t: statSync(join(PASTA_DE_APROVACOES, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (arqs.length > 0) recente = JSON.parse(readFileSync(arqs[0].f, "utf8"));
  }

  const mudaram = [];
  if (recente !== null) {
    const antes = recente.inventario ?? {};
    for (const f of new Set([...Object.keys(antes), ...Object.keys(inventario)])) {
      if (antes[f] !== inventario[f])
        mudaram.push(`${antes[f] === undefined ? "novo" : inventario[f] === undefined ? "removido" : "alterado"}: ${f}`);
    }
  }

  return {
    ok: false,
    digesto,
    quando: recente?.quando ?? null,
    mudaram: mudaram.sort(),
    motivo:
      recente === null
        ? `nenhuma conferencia de tipos foi gravada para este repositorio`
        : `a aprovacao mais recente (${recente.quando}, digesto ${String(recente.digesto).slice(0, 12)}) nao cobre o conteudo atual (${digesto.slice(0, 12)})`,
  };
}

/** A mensagem inteira, do jeito que o build e o release a mostram. */
export function explicarRecusa(r) {
  const lista =
    r.mudaram.length === 0
      ? ""
      : `\n\nO que mudou desde a ultima conferencia (${r.mudaram.length} arquivo(s)):\n` +
        r.mudaram.slice(0, 40).map((l) => `  · ${l}`).join("\n") +
        (r.mudaram.length > 40 ? `\n  … e mais ${r.mudaram.length - 40}` : "");
  return (
    `\n⚠️ A CONFERENCIA DE TIPOS DO BUILD FOI DISPENSADA SEM PROVA PARA ESTE CONTEUDO.\n\n` +
    `Motivo: ${r.motivo}.\n` +
    `Digesto do conteudo atual: ${r.digesto}${lista}\n\n` +
    `Ligar a variavel NAO aprova nada: ela apenas declara que o "npm run tipos:conferir" ` +
    `rodou e passou SOBRE ESTE MESMO CONTEUDO. A prova e o arquivo de aprovacao, e ele e ` +
    `procurado pelo digesto — por isso uma variavel deixada no ambiente de um servidor nao ` +
    `aprova o build de amanha.\n\n` +
    `O que fazer:  npm run tipos:conferir\n`
  );
}

if (process.argv[1]?.endsWith("conferencia-de-tipos.mjs") === true) {
  const modo = process.argv[2] ?? "conferir";
  if (modo === "conferir") process.exit(conferir());
  else if (modo === "exigir") {
    const r = conferenciaAprovada();
    if (r.ok) {
      console.error(`[tipos] aprovacao valida para o conteudo atual (${r.digesto.slice(0, 12)}), de ${r.quando}.`);
      process.exit(0);
    }
    console.error(explicarRecusa(r));
    process.exit(1);
  } else if (modo === "digesto") {
    console.log(digestoDeTipos().digesto);
  } else {
    console.error("uso: node scripts/conferencia-de-tipos.mjs [conferir|exigir|digesto]");
    process.exit(2);
  }
}
