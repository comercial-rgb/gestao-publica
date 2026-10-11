-- V39-R3 (R3-016) — o movimento do realizavel aponta o movimento bancario que o leva ao caixa (achado da auditoria: o
-- caixa saia no razao sem fato que os leitores de caixa enxergassem). Aditiva: coluna anulavel, unica, com FK.

-- AlterTable
ALTER TABLE "MovimentoDeRealizavel" ADD COLUMN     "movimentoBancarioId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDeRealizavel_movimentoBancarioId_key" ON "MovimentoDeRealizavel"("movimentoBancarioId");

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_movimentoBancarioId_fkey" FOREIGN KEY ("movimentoBancarioId") REFERENCES "MovimentoBancario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

