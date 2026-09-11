-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'DIVIDA_FUNDADA';
ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'DIVIDA_ATIVA';

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "dividaAtivaId" TEXT,
ADD COLUMN     "dividaId" TEXT;

-- AlterTable
ALTER TABLE "ValorDeCampoAdicional" ADD COLUMN     "dividaAtivaId" TEXT,
ADD COLUMN     "dividaId" TEXT;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_dividaAtivaId_fkey" FOREIGN KEY ("dividaAtivaId") REFERENCES "DividaAtiva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_dividaAtivaId_fkey" FOREIGN KEY ("dividaAtivaId") REFERENCES "DividaAtiva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
