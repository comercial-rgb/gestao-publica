/**
 * GUARDA-CHUVA do banco de teste.
 *
 * A suíte de integração dá `deleteMany` nas tabelas de domínio no `beforeEach`.
 * Se ela rodar contra o banco de dev (ou, Deus nos livre, de produção), TRUNCA
 * o plano de contas, o plano de classificação e o ledger. Isso já aconteceu
 * três vezes com o seed de dev nesta obra.
 *
 * Este módulo torna isso FISICAMENTE IMPOSSÍVEL: nada na suíte obtém uma URL de
 * banco sem passar por `urlDoBancoDeTeste()`, que ABORTA se
 *   - `DATABASE_URL_TEST` não estiver definida, ou
 *   - ela apontar para o MESMO alvo que `DATABASE_URL`.
 *
 * "Mesmo alvo" = host + porta + database + schema. Trocar só o `?schema=`
 * JÁ CONTA como banco diferente (é isolamento válido no Postgres); trocar nada
 * não conta.
 */

export interface AlvoDoBanco {
  readonly host: string;
  readonly porta: string;
  readonly database: string;
  readonly schema: string;
}

/** Normaliza uma connection string no alvo que ela de fato atinge. */
export function alvoDoBanco(url: string): AlvoDoBanco {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Connection string inválida: "${url}".`);
  }
  return {
    host: u.hostname.toLowerCase(),
    porta: u.port === "" ? "5432" : u.port,
    // pathname vem como "/siafic_cg"
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    schema: u.searchParams.get("schema") ?? "public",
  };
}

export function mesmoAlvo(a: string, b: string): boolean {
  const x = alvoDoBanco(a);
  const y = alvoDoBanco(b);
  return (
    x.host === y.host &&
    x.porta === y.porta &&
    x.database === y.database &&
    x.schema === y.schema
  );
}

/**
 * Devolve a URL do banco de TESTE, ou lança com mensagem clara.
 * FAIL-CLOSED: na dúvida, não roda.
 */
export function urlDoBancoDeTeste(
  env: NodeJS.ProcessEnv = process.env
): string {
  const teste = env["DATABASE_URL_TEST"];
  const dev = env["DATABASE_URL"];

  if (teste === undefined || teste.trim() === "") {
    throw new Error(
      "DATABASE_URL_TEST não está definida.\n" +
        "A suíte de integração TRUNCA as tabelas de domínio — ela precisa de um " +
        "banco só dela.\n" +
        'Defina no .env, por exemplo:\n' +
        '  DATABASE_URL_TEST="postgresql://siafic:siafic@localhost:5432/siafic_cg_test?schema=public"'
    );
  }

  if (dev !== undefined && dev.trim() !== "" && mesmoAlvo(teste, dev)) {
    const alvo = alvoDoBanco(teste);
    throw new Error(
      "DATABASE_URL_TEST aponta para o MESMO banco que DATABASE_URL " +
        `(${alvo.host}:${alvo.porta}/${alvo.database}?schema=${alvo.schema}).\n` +
        "Rodar a suíte assim APAGARIA os dados desse banco: os testes de " +
        "integração dão deleteMany no plano de contas, no plano de " +
        "classificação e no ledger.\n" +
        "Aponte DATABASE_URL_TEST para um database (ou schema) separado."
    );
  }

  return teste;
}
