-- AlterEnum
ALTER TYPE "TipoMovimentoRestosAPagar" ADD VALUE 'ESTORNO_PAGAMENTO';

-- AlterTable
ALTER TABLE "MovimentoRestosAPagar" ADD COLUMN     "estornoDeId" TEXT;

-- CreateIndex
CREATE INDEX "MovimentoRestosAPagar_estornoDeId_idx" ON "MovimentoRestosAPagar"("estornoDeId");

-- AddForeignKey
ALTER TABLE "MovimentoRestosAPagar" ADD CONSTRAINT "MovimentoRestosAPagar_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoRestosAPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
