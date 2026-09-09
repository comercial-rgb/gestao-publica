-- CreateEnum
CREATE TYPE "TipoRestosAPagar" AS ENUM ('PROCESSADO', 'NAO_PROCESSADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoRestosAPagar" AS ENUM ('PAGAMENTO', 'CANCELAMENTO');

-- CreateTable
CREATE TABLE "InscricaoRestosAPagar" (
    "id" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "exercicioOrigem" INTEGER NOT NULL,
    "tipo" "TipoRestosAPagar" NOT NULL,
    "valorInscrito" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "InscricaoRestosAPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoRestosAPagar" (
    "id" TEXT NOT NULL,
    "inscricaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoRestosAPagar" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "lancamentoId" TEXT,
    "pagamentoId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoRestosAPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InscricaoRestosAPagar_exercicioOrigem_tipo_idx" ON "InscricaoRestosAPagar"("exercicioOrigem", "tipo");

-- CreateIndex
CREATE INDEX "InscricaoRestosAPagar_empenhoId_idx" ON "InscricaoRestosAPagar"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "InscricaoRestosAPagar_empenhoId_exercicioOrigem_tipo_key" ON "InscricaoRestosAPagar"("empenhoId", "exercicioOrigem", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoRestosAPagar_inscricaoId_tipo_idx" ON "MovimentoRestosAPagar"("inscricaoId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoRestosAPagar_lancamentoId_idx" ON "MovimentoRestosAPagar"("lancamentoId");

-- AddForeignKey
ALTER TABLE "InscricaoRestosAPagar" ADD CONSTRAINT "InscricaoRestosAPagar_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoRestosAPagar" ADD CONSTRAINT "MovimentoRestosAPagar_inscricaoId_fkey" FOREIGN KEY ("inscricaoId") REFERENCES "InscricaoRestosAPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoRestosAPagar" ADD CONSTRAINT "MovimentoRestosAPagar_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoRestosAPagar" ADD CONSTRAINT "MovimentoRestosAPagar_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
