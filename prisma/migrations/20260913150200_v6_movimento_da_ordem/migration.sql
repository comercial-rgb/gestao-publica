-- V6 P1.1 — o estorno da ordem de compra vira FATO (append-only): o papel de runtime não apaga linha.
-- DDL gerada por `prisma migrate diff` sobre o schema local (enum novo + tabela, nada removido).

-- CreateEnum
CREATE TYPE "TipoMovimentoDaOrdemDeCompra" AS ENUM ('ESTORNO');

-- CreateTable
CREATE TABLE "MovimentoDaOrdemDeCompra" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaOrdemDeCompra" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaOrdemDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimentoDaOrdemDeCompra_ordemId_tipo_idx" ON "MovimentoDaOrdemDeCompra"("ordemId", "tipo");

-- AddForeignKey
ALTER TABLE "MovimentoDaOrdemDeCompra" ADD CONSTRAINT "MovimentoDaOrdemDeCompra_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

