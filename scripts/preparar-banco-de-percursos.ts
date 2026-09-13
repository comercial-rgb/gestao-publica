import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { alvoDoBanco, mesmoAlvo } from "../test/db-teste.js";

/**
 * O BANCO DOS PERCURSOS DE NAVEGADOR — separado do de desenvolvimento e do de testes
 * (orquestração V3, 4.4).
 *
 * ═══ POR QUE UM TERCEIRO BANCO ═══
 * Os percursos (`scripts/smoke-*.ts`) entram pela tela e GRAVAM: roteiros, bens,
 * empenhos, perfis. Até aqui gravavam no banco do DESENVOLVEDOR — e foi assim que três
 * roteiros contábeis instrumentais (as "duas primeiras analíticas" que um percurso
 * escolheu para exercitar a mecânica) ficaram disponíveis como configuração operacional,
 * com quatro movimentos e quatro lançamentos por cima. A suíte de integração já tem o
 * banco dela (`DATABASE_URL_TEST`, truncado a cada teste); os percursos ganham o deles
 * (`DATABASE_URL_PERCURSOS`), povoado por uma sequência DECLARADA de seeds, e o servidor
 * dos percursos sobe apontando para ele (`npm run percursos:servir`).
 *
 * ═══ O QUE ESTE SCRIPT FAZ ═══
 *   1. recusa se `DATABASE_URL_PERCURSOS` faltar ou coincidir com o de dev ou de teste;
 *   2. cria o database se não existir;
 *   3. migrations, SQL manual e papel de runtime — os mesmos passos de qualquer instalação;
 *   4. os seeds, na ordem que uma instalação usa, mais os de cenário dos percursos, todos
 *      com `DATABASE_URL` apontado para o banco dos percursos e o autor em `SEED_IDENTIDADE`;
 *   5. as atualizações versionadas de permissões (v1 a v8) e a configuração de
 *      DEMONSTRAÇÃO dos roteiros (`seed:roteiros-demo`) — identificada como tal.
 *
 * ⚠️ ELE NÃO TOCA NO BANCO DE DESENVOLVIMENTO. Fixture isolada não é proibida; confundir
 * fixture com configuração de produção é — e é isso que a separação impede.
 *
 * Uso:  npm run percursos:preparar
 *       npm run percursos:servir          (next start -p 3010 sobre o banco dos percursos)
 */
const dev = process.env["DATABASE_URL"] ?? "";
const teste = process.env["DATABASE_URL_TEST"] ?? "";
const percursos = process.env["DATABASE_URL_PERCURSOS"] ?? "";
const senhaAdmin = process.env["SEED_ADMIN_SENHA"] ?? "";

if (percursos.trim() === "") {
  throw new Error(
    "DATABASE_URL_PERCURSOS não definida. Os percursos de navegador precisam de um banco SÓ " +
      "deles — ver .env.example. Nada foi feito."
  );
}
for (const [nome, outra] of [["DATABASE_URL", dev], ["DATABASE_URL_TEST", teste]] as const) {
  if (outra !== "" && mesmoAlvo(percursos, outra)) {
    throw new Error(
      `DATABASE_URL_PERCURSOS aponta para o MESMO banco que ${nome}. Os percursos gravam pela ` +
        `tela; num banco compartilhado eles deixam configuração instrumental como se fosse ` +
        `operacional. Aponte para um database próprio. Nada foi feito.`
    );
  }
}
if (senhaAdmin === "") throw new Error("SEED_ADMIN_SENHA ausente — o bootstrap do banco dos percursos precisa dela.");

const alvo = alvoDoBanco(percursos);
const ADMIN = "admin@cg.pb.gov.br";

// (2) o database
{
  const admin = new URL(percursos);
  admin.pathname = "/postgres";
  admin.search = "";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  try {
    const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [alvo.database]);
    if (existe.rowCount === 0) {
      if (!/^[a-zA-Z0-9_]+$/.test(alvo.database)) throw new Error(`Nome de database inseguro: "${alvo.database}".`);
      await c.query(`CREATE DATABASE "${alvo.database}"`);
      console.log(`[percursos] database "${alvo.database}" criado.`);
    } else {
      console.log(`[percursos] database "${alvo.database}" já existe — seeds idempotentes serão reaplicados.`);
    }
  } finally {
    await c.end();
  }
}

const env = { ...process.env, DATABASE_URL: percursos, SEED_IDENTIDADE: ADMIN };
/**
 * Roda um passo e ECOA a saída. A tolerância lê a saída CAPTURADA (stdout + stderr): com
 * `stdio: "inherit"` o erro do filho chega sem texto ("Command failed"), e a primeira
 * versão disto não reconhecia o "BOOTSTRAP RECUSADO" que ela mesma esperava tolerar.
 */
function rodar(rotulo: string, comando: string, args: readonly string[], tolerar?: RegExp): void {
  console.log(`\n[percursos] ${rotulo}`);
  try {
    const saida = execFileSync(comando, [...args], { env, stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });
    if (saida.trim() !== "") console.log(saida.trimEnd());
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const texto = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    if (texto.trim() !== "") console.log(texto.trimEnd());
    if (tolerar !== undefined && tolerar.test(texto)) {
      console.log(`[percursos] ${rotulo}: já feito (tolerado).`);
      return;
    }
    throw new Error(`[percursos] o passo "${rotulo}" falhou — veja a saída acima.`);
  }
}

// (3) a instalação
rodar("migrations", "npx", ["prisma", "migrate", "deploy"]);
rodar("SQL manual", "npx", ["tsx", "scripts/aplicar-sql-manual.ts"]);
rodar("papel de runtime", "npx", ["tsx", "scripts/provisionar-papel-runtime.ts", percursos]);

// (4) os seeds, na ordem de uma instalação — depois os cenários dos percursos
// ⚠️ O PLANO OFICIAL (7.864 contas do TCE-PB), e não o mínimo de `pcasp.ts`: os roteiros da
// dívida ativa e a configuração de demonstração citam contas pelo código oficial, e a
// primeira execução deste preparador parou exatamente aí — "contas do PCASP ausentes".
rodar("plano de contas OFICIAL (PCASP TCE-PB)", "npx", ["tsx", "prisma/seed/pcasp-oficial.ts"]);
rodar("classificações oficiais (M02)", "npx", ["tsx", "prisma/seed/m02-seed-oficial.ts"]);
rodar("roteiro orçamentário", "npx", ["tsx", "prisma/seed/roteiro-orcamentario.ts"]);
rodar("tipos de consignação (M07)", "npx", ["tsx", "prisma/seed/m07-tipos-consignacao.ts"]);
rodar("exercício 2026", "npx", ["tsx", "prisma/seed/m08-exercicio.ts", "2026"]);
// ⚠️ O BOOTSTRAP RECUSA BANCO POVOADO — na reexecução ele falha nomeando, e isso é o
// comportamento certo; aqui a recusa é tolerada porque o admin já existe.
rodar("bootstrap do administrador", "npx", ["tsx", "prisma/seed/bootstrap-usuario.ts"], /BOOTSTRAP RECUSADO/);
rodar("cenário de aceite (ficha e dotação)", "npx", ["tsx", "prisma/seed/cenario-aceite.ts"]);
rodar("cenário SAGRES (UG 99001)", "npx", ["tsx", "prisma/seed/sagres-poc.ts"], /posição \d+ da fila/);
rodar("operador restrito (percurso de dois atores)", "npx", ["tsx", "scripts/poc-usuario-restrito.ts"]);
// V6 P1.3 — quatro usuários por papel (compras, almoxarifado, contabilidade, tesouraria): nunca o admin em todos os passos.
rodar("usuários por papel (cadeia por papel)", "npx", ["tsx", "scripts/percursos-usuarios-por-papel.ts"]);
rodar("roteiros da dívida ativa (fonte com motivo)", "npx", ["tsx", "prisma/seed/roteiros-patrimoniais.ts"]);
// V4 (§10): o percurso do ENT02 (protocolo) precisa dos assuntos, setores e tipos de comunicado; o seed
// é idempotente por recusa nomeada (reusa o que já existe).
rodar("cenário do ENT02 (protocolo, comunicação, suporte)", "npx", ["tsx", "prisma/seed/cenario-ent02.ts"]);

// (5) permissões versionadas e a configuração de DEMONSTRAÇÃO dos roteiros
rodar("versionar roteiros existentes", "npx", ["tsx", "scripts/versionar-roteiros-existentes.ts"]);
rodar("atualização de permissões v1", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "1"], /JÁ APLICADA/);
rodar("atualização de permissões v2", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "2"], /JÁ APLICADA/);
rodar("atualização de permissões v3", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "3"], /JÁ APLICADA/);
rodar("atualização de permissões v4", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "4"], /JÁ APLICADA/);
rodar("atualização de permissões v5", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "5"], /JÁ APLICADA/);
rodar("atualização de permissões v6", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "6"], /JÁ APLICADA/);
rodar("atualização de permissões v7", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "7"], /JÁ APLICADA/);
rodar("atualização de permissões v8", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "8"], /JÁ APLICADA/);
rodar("atualização de permissões v9", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "9"], /JÁ APLICADA/);
rodar("atualização de permissões v10", "npx", ["tsx", "scripts/aplicar-atualizacao-de-permissoes.ts", "10"], /JÁ APLICADA/);
rodar("roteiros de DEMONSTRAÇÃO do acervo (identificados como tal)", "npx", ["tsx", "prisma/seed/roteiros-demo.ts"]);

console.log(
  `\n[percursos] pronto: ${alvo.host}:${alvo.porta}/${alvo.database}. ` +
    `Suba o servidor com \`npm run percursos:servir\` e rode os percursos contra http://localhost:3010.`
);
