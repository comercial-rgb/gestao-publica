-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "anulacaoParcialDeId" TEXT;

-- AlterTable
ALTER TABLE "Liquidacao" ADD COLUMN     "anulacaoParcialDeId" TEXT;

-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN     "anulacaoParcialDeId" TEXT;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_anulacaoParcialDeId_fkey" FOREIGN KEY ("anulacaoParcialDeId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_anulacaoParcialDeId_fkey" FOREIGN KEY ("anulacaoParcialDeId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_anulacaoParcialDeId_fkey" FOREIGN KEY ("anulacaoParcialDeId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
