-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "borderoId" TEXT;

-- CreateIndex
CREATE INDEX "Anexo_borderoId_idx" ON "Anexo"("borderoId");

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_borderoId_fkey" FOREIGN KEY ("borderoId") REFERENCES "Bordero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

