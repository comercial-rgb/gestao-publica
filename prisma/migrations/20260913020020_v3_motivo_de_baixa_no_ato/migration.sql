-- V3 (pacote 2) — o motivo de baixa do rol do ente, ligado ao ato. ADITIVA: coluna nova,
-- índice novo e a chave estrangeira (RESTRICT, como as demais do movimento).
-- AlterTable
ALTER TABLE "MovimentoPatrimonial" ADD COLUMN     "motivoDeBaixaId" TEXT;

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_motivoDeBaixaId_idx" ON "MovimentoPatrimonial"("motivoDeBaixaId");

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_motivoDeBaixaId_fkey" FOREIGN KEY ("motivoDeBaixaId") REFERENCES "MotivoDeBaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
