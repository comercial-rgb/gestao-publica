-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "contaContabilId" TEXT;

-- AddForeignKey
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
