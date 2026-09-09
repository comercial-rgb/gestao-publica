-- CreateEnum
CREATE TYPE "ChaveResultadoAlienacao" AS ENUM ('GANHO_ALIENACAO', 'PERDA_ALIENACAO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoPatrimonial" ADD VALUE 'BAIXA_DE_ATUALIZACAO_ACUMULADA';
ALTER TYPE "TipoMovimentoPatrimonial" ADD VALUE 'ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA';

-- AlterTable
ALTER TABLE "MovimentoPatrimonial" ADD COLUMN     "operacaoId" TEXT,
ADD COLUMN     "receitaArrecadadaId" TEXT;

-- CreateTable
CREATE TABLE "RoteiroResultadoAlienacao" (
    "id" TEXT NOT NULL,
    "chave" "ChaveResultadoAlienacao" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroResultadoAlienacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroResultadoAlienacao_chave_key" ON "RoteiroResultadoAlienacao"("chave");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_operacaoId_idx" ON "MovimentoPatrimonial"("operacaoId");

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroResultadoAlienacao" ADD CONSTRAINT "RoteiroResultadoAlienacao_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroResultadoAlienacao" ADD CONSTRAINT "RoteiroResultadoAlienacao_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
