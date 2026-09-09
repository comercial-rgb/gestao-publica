-- MULTI-ENTE (packages/tribunais-core) — o ente passa a declarar o SEU tribunal.
--
-- ⚠️ TRÊS ETAPAS NO MESMO ARQUIVO, E A ORDEM É O QUE TORNA A MIGRATION APLICÁVEL.
-- As colunas são NOT NULL e NÃO têm default. Adicioná-las já NOT NULL falharia em
-- qualquer banco com EnteConfig semeado (e todos têm: a tabela é singleton e a MSC
-- já roda) — o Postgres não sabe o que pôr na linha existente. Um default resolveria
-- a migration e criaria o problema pior, porque ficaria: o próximo ente semeado sem
-- informar o tribunal herdaria "TCE-PB" em silêncio e a remessa sairia para o
-- tribunal errado. Então: abre nullable, preenche o que existe, e SÓ ENTÃO tranca.
--
-- ⚠️ O CHECK MORA AQUI, NÃO EM prisma/sql/. Aquela pasta é para o que o Prisma não
-- expressa E que é reaplicável a cada rodada de teste (índices parciais, idempotentes).
-- Uma constraint de formato é parte da DEFINIÇÃO desta coluna: ela nasce com a coluna,
-- na mesma transação, e é isso que impede que exista, mesmo por um instante, um banco
-- com a coluna e sem a regra.

-- ── (1) ABRIR — nullable, para que a linha já existente sobreviva ao ALTER. ──
ALTER TABLE "EnteConfig" ADD COLUMN "tribunalCodigo" TEXT;
ALTER TABLE "EnteConfig" ADD COLUMN "tribunalUf" CHAR(2);
ALTER TABLE "EnteConfig" ADD COLUMN "planoContasSeed" TEXT;

-- ── (2) PREENCHER — o backfill do único ente que existe hoje: Campina Grande/PB. ──
--
-- ⚠️ O `WHERE ... IS NULL` não é decoração: torna a etapa idempotente e impede que um
-- reprocessamento sobrescreva um valor que alguém já tenha corrigido à mão.
UPDATE "EnteConfig"
   SET "tribunalCodigo" = 'TCE-PB',
       "tribunalUf" = 'PB',
       "planoContasSeed" = 'pcasp-federal'
 WHERE "tribunalCodigo" IS NULL
    OR "tribunalUf" IS NULL
    OR "planoContasSeed" IS NULL;

-- ── (3) TRANCAR — agora que não há linha sem valor, o NOT NULL passa. ──
ALTER TABLE "EnteConfig" ALTER COLUMN "tribunalCodigo" SET NOT NULL;
ALTER TABLE "EnteConfig" ALTER COLUMN "tribunalUf" SET NOT NULL;
ALTER TABLE "EnteConfig" ALTER COLUMN "planoContasSeed" SET NOT NULL;

-- ── (4) O FORMATO, NO BANCO — a mesma regra que o `resolverTribunal` aplica. ──
--
-- `AAA-UF`: três letras de sigla, hífen, a UF em duas. O regex é o do `registro.ts`,
-- e estar nos dois lugares é intencional: a aplicação recusa cedo e com boa mensagem,
-- o banco recusa SEMPRE — inclusive para um INSERT feito por fora do Prisma (um seed
-- ad-hoc, um psql de correção), que é justamente por onde um dado torto entraria.
ALTER TABLE "EnteConfig"
  ADD CONSTRAINT "ck_ente_tribunal_codigo_formato"
  CHECK ("tribunalCodigo" ~ '^[A-Z]{3}-[A-Z]{2}$');

ALTER TABLE "EnteConfig"
  ADD CONSTRAINT "ck_ente_tribunal_uf_formato"
  CHECK ("tribunalUf" ~ '^[A-Z]{2}$');
