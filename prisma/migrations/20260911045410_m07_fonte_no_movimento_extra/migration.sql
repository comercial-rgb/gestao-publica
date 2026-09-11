-- AlterTable
ALTER TABLE "MovimentoExtraorcamentario" ADD COLUMN     "fonteId" TEXT;

-- CreateIndex
CREATE INDEX "MovimentoExtraorcamentario_fonteId_idx" ON "MovimentoExtraorcamentario"("fonteId");

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
