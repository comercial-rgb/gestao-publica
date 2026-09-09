-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "contratoId" TEXT;

-- AlterTable
ALTER TABLE "ReservaDotacao" ADD COLUMN     "processoId" TEXT;

-- CreateTable
CREATE TABLE "HomologacaoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "HomologacaoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomologacaoProcesso_processoId_key" ON "HomologacaoProcesso"("processoId");

-- AddForeignKey
ALTER TABLE "ReservaDotacao" ADD CONSTRAINT "ReservaDotacao_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomologacaoProcesso" ADD CONSTRAINT "HomologacaoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
