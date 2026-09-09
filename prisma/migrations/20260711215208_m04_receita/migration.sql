-- CreateEnum
CREATE TYPE "TipoLancamentoReceita" AS ENUM ('ARRECADACAO', 'ANULACAO', 'RETIFICACAO');

-- CreateTable
CREATE TABLE "TipoLancamentoReceitaSagres" (
    "id" TEXT NOT NULL,
    "tipoInterno" "TipoLancamentoReceita" NOT NULL,
    "codigoSagres" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "TipoLancamentoReceitaSagres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaArrecadada" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "coId" TEXT,
    "exercicioFonte" INTEGER NOT NULL DEFAULT 1,
    "tipo" "TipoLancamentoReceita" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataArrecadacao" TIMESTAMP(3) NOT NULL,
    "numeroReceita" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ReceitaArrecadada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoLancamentoReceitaSagres_tipoInterno_key" ON "TipoLancamentoReceitaSagres"("tipoInterno");

-- CreateIndex
CREATE UNIQUE INDEX "TipoLancamentoReceitaSagres_codigoSagres_key" ON "TipoLancamentoReceitaSagres"("codigoSagres");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaArrecadada_lancamentoId_key" ON "ReceitaArrecadada"("lancamentoId");

-- CreateIndex
CREATE INDEX "ReceitaArrecadada_exercicio_naturezaReceitaId_idx" ON "ReceitaArrecadada"("exercicio", "naturezaReceitaId");

-- CreateIndex
CREATE INDEX "ReceitaArrecadada_fonteId_idx" ON "ReceitaArrecadada"("fonteId");

-- CreateIndex
CREATE INDEX "ReceitaArrecadada_estornoDeId_idx" ON "ReceitaArrecadada"("estornoDeId");

-- CreateIndex
CREATE INDEX "ReceitaArrecadada_dataArrecadacao_idx" ON "ReceitaArrecadada"("dataArrecadacao");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaArrecadada_exercicio_numeroReceita_tipo_key" ON "ReceitaArrecadada"("exercicio", "numeroReceita", "tipo");

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_coId_fkey" FOREIGN KEY ("coId") REFERENCES "CodigoAcompanhamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "ReceitaArrecadada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
