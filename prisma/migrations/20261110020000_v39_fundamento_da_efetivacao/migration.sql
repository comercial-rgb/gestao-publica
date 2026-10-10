-- V39-021 (M02) — O FUNDAMENTO DA EFETIVAÇÃO DA PROPOSTA: o que permitiu gerar o orçamento do exercício. Aditiva: colunas
-- anuláveis (a efetivação anterior à V39 fica com fundamento nulo — o histórico não se reescreve) e o CHECK de forma,
-- o mesmo de prisma/sql/ck_fundamento_da_efetivacao.sql.
-- AlterTable
ALTER TABLE "EfetivacaoDaProposta" ADD COLUMN     "fundamento" VARCHAR(30),
ADD COLUMN     "leiId" TEXT,
ADD COLUMN     "aprovacaoId" TEXT,
ADD COLUMN     "atoTipo" VARCHAR(30),
ADD COLUMN     "atoNumero" TEXT,
ADD COLUMN     "atoAno" INTEGER,
ADD COLUMN     "atoDispositivo" TEXT,
ADD COLUMN     "atoCitacao" TEXT;

ALTER TABLE "EfetivacaoDaProposta" ADD CONSTRAINT "ck_fundamento_da_efetivacao" CHECK (
  "fundamento" IS NULL
  OR ("fundamento" = 'LEI_APROVADA' AND "leiId" IS NOT NULL AND "aprovacaoId" IS NOT NULL AND "atoNumero" IS NULL)
  OR ("fundamento" = 'EXECUCAO_PROVISORIA' AND "leiId" IS NULL AND "aprovacaoId" IS NULL AND "atoTipo" IS NOT NULL
      AND "atoNumero" IS NOT NULL AND "atoAno" IS NOT NULL AND "atoDispositivo" IS NOT NULL AND "atoCitacao" IS NOT NULL)
  OR ("fundamento" = 'ENSAIO' AND "leiId" IS NULL AND "aprovacaoId" IS NULL AND "atoNumero" IS NULL)
);
