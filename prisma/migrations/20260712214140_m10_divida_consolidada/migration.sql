-- CreateEnum
CREATE TYPE "TipoDivida" AS ENUM ('CONTRATUAL', 'MOBILIARIA');

-- CreateEnum
CREATE TYPE "TipoMovimentoDivida" AS ENUM ('INGRESSO_OPERACAO_CREDITO', 'ATUALIZACAO_MONETARIA', 'AMORTIZACAO', 'ESTORNO_INGRESSO_OPERACAO_CREDITO', 'ESTORNO_ATUALIZACAO_MONETARIA', 'ESTORNO_AMORTIZACAO');

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "dividaId" TEXT;

-- CreateTable
CREATE TABLE "DividaConsolidada" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "credorNome" TEXT NOT NULL,
    "credorDocumento" TEXT NOT NULL,
    "tipo" "TipoDivida" NOT NULL,
    "leiAutorizativa" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DividaConsolidada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDivida" (
    "id" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDivida" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "competencia" TIMESTAMP(3),
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "receitaArrecadadaId" TEXT,
    "pagamentoId" TEXT,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDivida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroDivida" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoDivida" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroDivida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DividaConsolidada_identificador_key" ON "DividaConsolidada"("identificador");

-- CreateIndex
CREATE INDEX "DividaConsolidada_tipo_idx" ON "DividaConsolidada"("tipo");

-- CreateIndex
CREATE INDEX "MovimentoDivida_dividaId_tipo_idx" ON "MovimentoDivida"("dividaId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoDivida_dataMovimento_idx" ON "MovimentoDivida"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoDivida_pagamentoId_idx" ON "MovimentoDivida"("pagamentoId");

-- CreateIndex
CREATE INDEX "MovimentoDivida_estornoDeId_idx" ON "MovimentoDivida"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroDivida_tipo_key" ON "RoteiroDivida"("tipo");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividaConsolidada" ADD CONSTRAINT "DividaConsolidada_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDivida" ADD CONSTRAINT "MovimentoDivida_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDivida" ADD CONSTRAINT "MovimentoDivida_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDivida" ADD CONSTRAINT "MovimentoDivida_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDivida" ADD CONSTRAINT "MovimentoDivida_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDivida" ADD CONSTRAINT "MovimentoDivida_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoDivida"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroDivida" ADD CONSTRAINT "RoteiroDivida_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroDivida" ADD CONSTRAINT "RoteiroDivida_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
