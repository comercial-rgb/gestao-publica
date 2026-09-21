-- V11 V8.4 — O ROTEIRO ORÇAMENTÁRIO VERSIONADO (pendências ROTEIRO-RESERVA-SEM-CONTA e
-- ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS)
--
-- Aditiva: duas colunas novas e a troca de um índice único por outro mais largo. Nenhuma coluna
-- some, nenhum dado se perde — toda linha existente vira a versão 1.
--
-- ⚠️ POR QUE VERSIONAR: o ente TROCA a classificação contábil (o plano dele muda, o TCE orienta
-- diferente), e o razão escriturado ontem foi feito contra o roteiro de ontem. Um `UPDATE`
-- apagaria a resposta para "contra que roteiro este lançamento foi feito?". Além disso, o papel de
-- runtime não tem UPDATE nesta tabela: sem versão, o cadastro pela tela seria impossível sem
-- afrouxar o grant.
ALTER TABLE "RoteiroOrcamentario" ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RoteiroOrcamentario" ADD COLUMN "fundamento" TEXT;

DROP INDEX IF EXISTS "RoteiroOrcamentario_tipo_tipoCredito_key";
CREATE UNIQUE INDEX "RoteiroOrcamentario_tipo_tipoCredito_versao_key"
    ON "RoteiroOrcamentario"("tipo", "tipoCredito", "versao");
CREATE INDEX "RoteiroOrcamentario_tipo_tipoCredito_versao_idx"
    ON "RoteiroOrcamentario"("tipo", "tipoCredito", "versao");

-- ⚠️ O ÍNDICE PARCIAL É RECRIADO COM A VERSÃO. Ele mora em `prisma/sql/` porque o Prisma não
-- representa `WHERE`; aqui ele é trocado junto para que a migração não deixe uma janela em que a
-- unicidade antiga (sem versão) impeça a segunda versão de um roteiro sem tipo de crédito.
DROP INDEX IF EXISTS uq_roteiro_sem_tipo_de_credito;
CREATE UNIQUE INDEX uq_roteiro_sem_tipo_de_credito
    ON "RoteiroOrcamentario" ("tipo", "versao")
    WHERE "tipoCredito" IS NULL;

ALTER TABLE "RoteiroOrcamentario" ADD CONSTRAINT "ck_roteiro_versao_positiva" CHECK ("versao" >= 1);
