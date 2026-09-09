-- CreateEnum
CREATE TYPE "TipoMovimentoExtra" AS ENUM ('INGRESSO', 'DISPENDIO', 'ESTORNO_INGRESSO', 'ESTORNO_DISPENDIO');

-- CreateTable
CREATE TABLE "TipoConsignacao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TipoConsignacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoExtraorcamentario" (
    "id" TEXT NOT NULL,
    "tipoConsignacaoId" TEXT NOT NULL,
    "credorConsignatario" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoExtra" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "pagamentoId" TEXT,
    "estornoDeId" TEXT,
    "lancamentoId" TEXT NOT NULL,
    "historico" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoExtraorcamentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoConsignacao_codigo_key" ON "TipoConsignacao"("codigo");

-- CreateIndex
CREATE INDEX "MovimentoExtraorcamentario_tipoConsignacaoId_credorConsigna_idx" ON "MovimentoExtraorcamentario"("tipoConsignacaoId", "credorConsignatario");

-- CreateIndex
CREATE INDEX "MovimentoExtraorcamentario_pagamentoId_idx" ON "MovimentoExtraorcamentario"("pagamentoId");

-- CreateIndex
CREATE INDEX "MovimentoExtraorcamentario_estornoDeId_idx" ON "MovimentoExtraorcamentario"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoExtraorcamentario_data_idx" ON "MovimentoExtraorcamentario"("data");

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_tipoConsignacaoId_fkey" FOREIGN KEY ("tipoConsignacaoId") REFERENCES "TipoConsignacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoExtraorcamentario" ADD CONSTRAINT "MovimentoExtraorcamentario_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
