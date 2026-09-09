-- M06 — ordem cronológica de pagamentos (Lei 14.133/2021, art. 141).
--
-- ⚠️ MIGRATION ESCRITA À MÃO. O SQL que o `prisma migrate diff` gera para o
-- campo novo é:
--     ALTER TABLE "Empenho" ADD COLUMN "categoriaOrdemCronologica" ... NOT NULL;
-- e isso FALHA em qualquer banco que já tenha empenho — o Postgres não sabe o
-- que pôr nas linhas existentes. Passaria no dev (0 empenhos) e explodiria em
-- produção. Por isso o backfill em 3 passos abaixo.

-- CreateEnum
CREATE TYPE "CategoriaOrdemCronologica" AS ENUM ('FORNECIMENTO_BENS', 'LOCACAO', 'PRESTACAO_SERVICOS', 'REALIZACAO_OBRAS');

-- CreateEnum
CREATE TYPE "HipoteseQuebraOrdem" AS ENUM ('I_EMERGENCIA_CALAMIDADE', 'II_ME_EPP_RISCO', 'III_SISTEMAS_ESTRUTURANTES', 'IV_FALENCIA_RECUPERACAO', 'V_ATIVIDADE_FINALISTICA');

-- ---------------------------------------------------------------------------
-- Empenho.categoriaOrdemCronologica — coluna OBRIGATÓRIA em tabela existente.
--
-- (1) entra NULLABLE, para não quebrar as linhas que já existem;
-- (2) BACKFILL: empenhos anteriores ao art. 141 neste sistema não têm categoria
--     declarada. FORNECIMENTO_BENS é o valor de migração — escolhido no SCRIPT,
--     NUNCA como @default no schema: um default no schema faria todo empenho
--     NOVO virar FORNECIMENTO_BENS em silêncio, e a fila de obras se misturaria
--     com a de bens sem ninguém perceber. Aqui o default é histórico e explícito;
--     lá seria um bug permanente.
-- (3) só então NOT NULL — e daí em diante todo empenho novo é obrigado a
--     declarar a sua categoria.
-- ---------------------------------------------------------------------------

-- (1)
ALTER TABLE "Empenho" ADD COLUMN "categoriaOrdemCronologica" "CategoriaOrdemCronologica";

-- (2)
UPDATE "Empenho"
   SET "categoriaOrdemCronologica" = 'FORNECIMENTO_BENS'
 WHERE "categoriaOrdemCronologica" IS NULL;

-- (3)
ALTER TABLE "Empenho" ALTER COLUMN "categoriaOrdemCronologica" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- JustificativaQuebraOrdem — append-only (art. 141, §1º e §2º).
-- ---------------------------------------------------------------------------

CREATE TABLE "JustificativaQuebraOrdem" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "hipotese" "HipoteseQuebraOrdem" NOT NULL,
    "justificativa" TEXT NOT NULL,
    "autorizadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JustificativaQuebraOrdem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JustificativaQuebraOrdem_liquidacaoId_idx" ON "JustificativaQuebraOrdem"("liquidacaoId");
CREATE INDEX "JustificativaQuebraOrdem_hipotese_idx" ON "JustificativaQuebraOrdem"("hipotese");
CREATE INDEX "JustificativaQuebraOrdem_criadoEm_idx" ON "JustificativaQuebraOrdem"("criadoEm");

-- A fila do art. 141 ordena por data de liquidação.
CREATE INDEX "Liquidacao_data_idx" ON "Liquidacao"("data");

ALTER TABLE "JustificativaQuebraOrdem" ADD CONSTRAINT "JustificativaQuebraOrdem_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
