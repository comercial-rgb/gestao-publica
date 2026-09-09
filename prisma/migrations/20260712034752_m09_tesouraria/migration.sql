-- CreateEnum
CREATE TYPE "NaturezaLancamentoExtrato" AS ENUM ('CREDITO', 'DEBITO');

-- CreateEnum
CREATE TYPE "TipoInternoConciliacao" AS ENUM ('PAGAMENTO', 'ARRECADACAO', 'MOVIMENTO_EXTRA');

-- CreateEnum
CREATE TYPE "TipoVinculo" AS ENUM ('VINCULO', 'ESTORNO_VINCULO');

-- CreateTable
CREATE TABLE "ExtratoBancario" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "arquivoHash" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT NOT NULL,

    CONSTRAINT "ExtratoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoExtrato" (
    "id" TEXT NOT NULL,
    "extratoId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "fitid" TEXT NOT NULL,
    "dataPostagem" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "natureza" "NaturezaLancamentoExtrato" NOT NULL,
    "documento" TEXT,
    "memo" TEXT NOT NULL,
    "linhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LancamentoExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoConciliacao" (
    "id" TEXT NOT NULL,
    "lancamentoExtratoId" TEXT NOT NULL,
    "tipoInterno" "TipoInternoConciliacao" NOT NULL,
    "internoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "tipo" "TipoVinculo" NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VinculoConciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtratoBancario_arquivoHash_key" ON "ExtratoBancario"("arquivoHash");

-- CreateIndex
CREATE INDEX "LancamentoExtrato_extratoId_idx" ON "LancamentoExtrato"("extratoId");

-- CreateIndex
CREATE INDEX "LancamentoExtrato_contaBancariaId_dataPostagem_idx" ON "LancamentoExtrato"("contaBancariaId", "dataPostagem");

-- CreateIndex
CREATE UNIQUE INDEX "LancamentoExtrato_contaBancariaId_fitid_key" ON "LancamentoExtrato"("contaBancariaId", "fitid");

-- CreateIndex
CREATE INDEX "VinculoConciliacao_lancamentoExtratoId_idx" ON "VinculoConciliacao"("lancamentoExtratoId");

-- CreateIndex
CREATE INDEX "VinculoConciliacao_tipoInterno_internoId_idx" ON "VinculoConciliacao"("tipoInterno", "internoId");

-- CreateIndex
CREATE INDEX "VinculoConciliacao_estornoDeId_idx" ON "VinculoConciliacao"("estornoDeId");

-- AddForeignKey
ALTER TABLE "ExtratoBancario" ADD CONSTRAINT "ExtratoBancario_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoExtrato" ADD CONSTRAINT "LancamentoExtrato_extratoId_fkey" FOREIGN KEY ("extratoId") REFERENCES "ExtratoBancario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoExtrato" ADD CONSTRAINT "LancamentoExtrato_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoConciliacao" ADD CONSTRAINT "VinculoConciliacao_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "LancamentoExtrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoConciliacao" ADD CONSTRAINT "VinculoConciliacao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "VinculoConciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
