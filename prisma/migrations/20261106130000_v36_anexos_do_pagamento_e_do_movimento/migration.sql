-- V36 (TR 5.10.2.68 e 5.10.2.21): anexos no registro de pagamento e no movimento bancário. Aditiva: duas colunas
-- anuláveis, sem backfill. O dono único continua sendo regra do zAnexar (M22).
-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "movimentoBancarioId" TEXT,
ADD COLUMN     "pagamentoId" TEXT;

-- CreateIndex
CREATE INDEX "Anexo_pagamentoId_idx" ON "Anexo"("pagamentoId");

-- CreateIndex
CREATE INDEX "Anexo_movimentoBancarioId_idx" ON "Anexo"("movimentoBancarioId");

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_movimentoBancarioId_fkey" FOREIGN KEY ("movimentoBancarioId") REFERENCES "MovimentoBancario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

