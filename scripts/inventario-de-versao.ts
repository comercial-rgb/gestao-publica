import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import pg from "pg";

/**
 * INVENTÁRIO DE VERSÃO E AMBIENTES (V39-001) — o que está em cada lugar, perguntado a cada lugar.
 *
 *   npx tsx scripts/inventario-de-versao.ts http://localhost:3011 https://servidor.exemplo
 *
 * Para cada destino da linha de comando: o commit e o ambiente que o SERVIDOR declara (`/release`) e a natureza que
 * o BANCO declara (`/natureza-da-base`). Do repositório: o HEAD local, o mesmo ramo no remoto e a última migration
 * do código. Com DATABASE_URL: a última migration APLICADA naquele banco e a natureza declarada nele.
 *
 * Nada aqui se presume pelo GitHub: um commit no remoto não prova o que um servidor serve. Não imprime URL de banco,
 * senha nem variável de ambiente.
 */

function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "(indisponível)";
  }
}

async function json(url: string): Promise<{ readonly status: number; readonly corpo: unknown }> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, corpo: e instanceof Error ? e.message : String(e) };
  }
}

const ramo = git("rev-parse", "--abbrev-ref", "HEAD");
const local = git("rev-parse", "HEAD");
const remoto = git("ls-remote", "origin", `refs/heads/${ramo}`).split(/\s+/)[0] ?? "(indisponível)";
// `npm run publicar` empurra HEAD para a `main` do remoto (scripts/publicar.sh): é ela que o pipeline instala.
const mainRemota = git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0] ?? "(indisponível)";
const migracoes = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const ultimaDoCodigo = migracoes.at(-1) ?? "(nenhuma)";

console.log("== repositório ==");
console.log(`ramo ${ramo}`);
console.log(`HEAD local      ${local}`);
console.log(`mesmo ramo no remoto ${remoto === "" ? "(não publicado)" : remoto}${remoto === local ? " (igual ao local)" : ""}`);
console.log(`main no remoto (o que a publicação instala) ${mainRemota}${mainRemota === local ? " (igual ao local)" : ""}`);
console.log(`árvore ${git("status", "--porcelain") === "" ? "limpa" : "COM ALTERAÇÕES não commitadas"}`);
console.log(`última migration do código ${ultimaDoCodigo}`);

for (const destino of process.argv.slice(2)) {
  console.log(`\n== ${new URL(destino).origin} ==`);
  const rel = await json(new URL("/release", destino).toString());
  const nat = await json(new URL("/natureza-da-base", destino).toString());
  const r = (rel.corpo ?? {}) as { candidato?: unknown; commit?: unknown; ambiente?: unknown };
  const n = (nat.corpo ?? {}) as { natureza?: unknown; declaracao?: unknown };
  console.log(`servidor (/release, HTTP ${String(rel.status)}): commit ${String(r.commit ?? "-")}, ambiente ${String(r.ambiente ?? "-")}, candidato ${String(r.candidato ?? "-")}`);
  if (typeof r.commit === "string" && r.commit !== "") console.log(`  o commit servido ${local.startsWith(r.commit) ? "É" : "NÃO é"} o HEAD local`);
  console.log(`banco (/natureza-da-base, HTTP ${String(nat.status)}): ${String(n.natureza ?? "-")}${n.declaracao == null ? "" : ` (declaração ${String(n.declaracao)})`}`);
}

const url = process.env["DATABASE_URL"];
if (url !== undefined && url !== "" && process.env["INVENTARIO_SEM_BANCO"] !== "1") {
  console.log("\n== banco de DATABASE_URL ==");
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
    const m = await c.query<{ migration_name: string; finished_at: Date | null }>(
      `SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1`,
    );
    const aplicada = m.rows[0]?.migration_name ?? "(nenhuma)";
    console.log(`banco ${(await c.query<{ d: string }>("SELECT current_database() AS d")).rows[0]?.d ?? "?"}`);
    console.log(`última migration aplicada ${aplicada}${aplicada === ultimaDoCodigo ? " (igual à do código)" : " (DIFERENTE da do código)"}`);
    const n = await c.query<{ natureza: string; numero: number }>(`SELECT natureza, numero FROM "DeclaracaoDaNaturezaDaBase" ORDER BY numero DESC LIMIT 1`).catch(() => null);
    console.log(`natureza declarada ${n === null ? "(tabela ausente: migration da V39 não aplicada)" : (n.rows[0]?.natureza ?? "NAO_DECLARADA")}`);
  } catch (e) {
    console.log(`(não foi possível ler o banco: ${e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>") : String(e)})`);
  } finally {
    await c.end().catch(() => undefined);
  }
}
