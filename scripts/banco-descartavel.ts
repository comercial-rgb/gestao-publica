import "dotenv/config";
import pg from "pg";

/**
 * O BANCO DESCARTÁVEL DE UMA EXECUÇÃO (V7 M1 U0 §2.2) — clonar por TEMPLATE, conferindo identidade.
 *
 * Uso:
 *   npx tsx scripts/banco-descartavel.ts clonar  <origem> <destino>
 *   npx tsx scripts/banco-descartavel.ts remover <destino>
 *   npx tsx scripts/banco-descartavel.ts url     <destino>     (imprime a URL SEM a senha, para conferência)
 *
 * ⚠️ O QUE ELE RECUSA, E POR QUÊ:
 *  · destino fora do padrão `gestao_publica_<percursos|capturas|instalacao>_v7m1_<nome>` — só um banco
 *    com nome de descartável pode ser (re)criado ou removido. Dev, teste, demonstração e os bancos de
 *    percursos originais NÃO casam o padrão;
 *  · destino igual à origem, ou igual ao banco de `DATABASE_URL`/`DATABASE_URL_TEST`/`DATABASE_URL_PERCURSOS`;
 *  · servidor que não é local (localhost/127.0.0.1) — este script não fala com banco remoto;
 *  · origem com conexões abertas (o TEMPLATE exige; derrubar conexões alheias não é tarefa dele).
 * ⚠️ Nenhuma credencial é impressa. A saída traz banco, servidor, porta, versão e dono.
 */

const PADRAO = /^gestao_publica_(percursos|capturas|instalacao)_v7m1_[a-z0-9_]{1,40}$/;

function base(): URL {
  const bruta = process.env["DATABASE_URL_PERCURSOS"] ?? process.env["DATABASE_URL"];
  if (bruta === undefined || bruta === "") throw new Error("DATABASE_URL_PERCURSOS (ou DATABASE_URL) ausente.");
  const u = new URL(bruta);
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error(`servidor ${u.hostname} não é local — recusado.`);
  return u;
}

const nomeDe = (chave: string): string | null => {
  const v = process.env[chave];
  return v === undefined || v === "" ? null : new URL(v).pathname.replace(/^\//, "");
};

function exigirDescartavel(destino: string, origem?: string): void {
  if (!PADRAO.test(destino)) throw new Error(`"${destino}" não tem nome de banco descartável (${PADRAO}). Nada foi feito.`);
  const protegidos = ["DATABASE_URL", "DATABASE_URL_TEST", "DATABASE_URL_PERCURSOS"].map(nomeDe).filter((x): x is string => x !== null);
  if (protegidos.includes(destino)) throw new Error(`"${destino}" é banco configurado no ambiente — recusado.`);
  if (origem !== undefined && origem === destino) throw new Error("origem e destino iguais — recusado.");
}

async function conectar(banco: string): Promise<pg.Client> {
  const u = base();
  u.pathname = `/${banco}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}

const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`;

async function identidade(banco: string): Promise<void> {
  const c = await conectar(banco);
  try {
    const r = await c.query<{ banco: string; versao: string; porta: string; dono: string; usuario: string }>(
      "SELECT current_database() AS banco, current_setting('server_version') AS versao, current_setting('port') AS porta, pg_get_userbyid(d.datdba) AS dono, current_user AS usuario FROM pg_database d WHERE d.datname = current_database()"
    );
    const x = r.rows[0];
    console.log(`[banco-descartável] ${x?.banco} · servidor ${base().hostname}:${x?.porta} · PostgreSQL ${x?.versao} · dono ${x?.dono} · conectado como ${x?.usuario}`);
  } finally {
    await c.end();
  }
}

async function main(): Promise<void> {
  const [acao, a, b] = process.argv.slice(2);
  if (acao === "clonar" && a !== undefined && b !== undefined) {
    exigirDescartavel(b, a);
    const c = await conectar("postgres");
    try {
      const abertas = await c.query<{ n: string }>("SELECT count(*)::text AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [a]);
      if (Number(abertas.rows[0]?.n ?? "0") > 0) throw new Error(`a origem "${a}" tem ${abertas.rows[0]?.n} conexão(ões) aberta(s): o TEMPLATE exige nenhuma. Encerre só o que for desta execução e tente de novo.`);
      const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [b]);
      if (existe.rowCount !== null && existe.rowCount > 0) {
        await c.query(`DROP DATABASE ${ident(b)}`);
        console.log(`[banco-descartável] ${b} existia (nome descartável) e foi removido antes do clone.`);
      }
      await c.query(`CREATE DATABASE ${ident(b)} TEMPLATE ${ident(a)}`);
      console.log(`[banco-descartável] ${b} clonado de ${a}.`);
    } finally {
      await c.end();
    }
    await identidade(b);
    return;
  }
  if (acao === "remover" && a !== undefined) {
    exigirDescartavel(a);
    const c = await conectar("postgres");
    try {
      await c.query(`DROP DATABASE IF EXISTS ${ident(a)}`);
      console.log(`[banco-descartável] ${a} removido.`);
    } finally {
      await c.end();
    }
    return;
  }
  if (acao === "url" && a !== undefined) {
    exigirDescartavel(a);
    const u = base();
    u.pathname = `/${a}`;
    u.password = "***";
    console.log(u.toString());
    return;
  }
  console.error("uso: clonar <origem> <destino> | remover <destino> | url <destino>");
  process.exit(2);
}

main().catch((e) => {
  console.error(`[banco-descartável] RECUSADO: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
