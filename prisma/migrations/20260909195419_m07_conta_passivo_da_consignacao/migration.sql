-- AlterTable
ALTER TABLE "TipoConsignacao" ADD COLUMN     "contaPassivoId" TEXT;

-- AddForeignKey
ALTER TABLE "TipoConsignacao" ADD CONSTRAINT "TipoConsignacao_contaPassivoId_fkey" FOREIGN KEY ("contaPassivoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
