-- V27 — o PDF do decreto de transposição, remanejamento ou transferência, anexo do ato de realocação (SAGRES §4.6;
-- os itens vão à §4.5 com os tipos 12/13). Aditiva.

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "atoDeRealocacaoId" TEXT;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_atoDeRealocacaoId_fkey" FOREIGN KEY ("atoDeRealocacaoId") REFERENCES "AtoDeRealocacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
