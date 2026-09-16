import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ═══ A CONFERÊNCIA DE TIPOS SEPARADA, E A PROVA QUE A AMARRA AO CONTEÚDO (V9 N0) ═══
 *
 * ⚠️ O PROBLEMA QUE ISTO RESOLVE. `next build` confere tipos num worker próprio, cujo heap
 * não herda o `--max-old-space-size` do repositório. Nesta máquina de 8 GB esse worker
 * MORRE — SIGABRT, sem mensagem — e a saída de `npm run typecheck:app` (o MESMO tsconfig,
 * o MESMO `.next/types`) é a única forma de conferir os tipos do app sem derrubar o build.
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
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

/** O inventário: caminho relativo -> sha256 do conteúdo. Ordenado, para ser estável. */
export function inventarioDeTipos() {
  const inv = {};
  for (const raiz of [...RAIZES_DE_FONTE, ...RAIZES_GERADAS])
    for (const f of varrer(raiz)) inv[f] = sha256(readFileSync(join(RAIZ, f)));
  for (const f of ARQUIVOS_AVULSOS)
    if (existsSync(join(RAIZ, f))) inv[f] = sha256(readFileSync(join(RAIZ, f)));
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
 * 65% da memória total, com teto de 6 GB e piso de 1,5 GB.
 */
export function heapEmMegabytes() {
  const totalMb = Math.floor(totalmem() / (1024 * 1024));
  return Math.max(1536, Math.min(6144, Math.floor(totalMb * 0.65)));
}

/** Roda o `tsc` do app e, se ele passar, GRAVA a aprovação com o inventário inteiro. */
export function conferir() {
  const { digesto, inventario } = digestoDeTipos();
  const heap = heapEmMegabytes();
  const comando = ["tsc", "--noEmit", "-p", "tsconfig.json"];

  console.error(`[tipos] digesto do conteudo: ${digesto}`);
  console.error(`[tipos] heap do tsc: ${heap} MB (memoria total ${Math.floor(totalmem() / 1024 / 1024)} MB)`);

  const inicio = Date.now();
  const r = spawnSync("npx", comando, {
    cwd: RAIZ,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heap}` },
  });
  const duracaoMs = Date.now() - inicio;

  if (r.signal !== null && r.signal !== undefined) {
    console.error(`[tipos] ⚠️ o tsc foi MORTO pelo sinal ${r.signal} em ${duracaoMs} ms. Isto nao e aprovacao nem reprovacao: e execucao que nao terminou.`);
    return 128;
  }
  if (r.status !== 0) {
    console.error(`[tipos] reprovado (codigo ${r.status}) em ${duracaoMs} ms. Nenhuma aprovacao gravada.`);
    return r.status ?? 1;
  }

  mkdirSync(PASTA_DE_APROVACOES, { recursive: true });
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).stdout?.trim() ?? "(sem git)";
  const sujo = (spawnSync("git", ["status", "--porcelain"], { cwd: RAIZ, encoding: "utf8" }).stdout ?? "").trim() !== "";
  writeFileSync(
    caminhoDaAprovacao(digesto),
    JSON.stringify(
      {
        digesto,
        quando: new Date().toISOString(),
        comando: `npx ${comando.join(" ")}`,
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
