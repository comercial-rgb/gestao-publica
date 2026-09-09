-- CreateTable
CREATE TABLE "Liquidacao" (
    "id" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "responsavelAtesto" TEXT NOT NULL,
    "notaFiscalChave" TEXT,
    "notaFiscalNum" TEXT,
    "notaFiscalSerie" TEXT,
    "notaFiscalData" TIMESTAMP(3),
    "notaFiscalValor" DECIMAL(18,2),
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Liquidacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "contaBancaria" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacao_lancamentoId_key" ON "Liquidacao"("lancamentoId");

-- CreateIndex
CREATE INDEX "Liquidacao_empenhoId_idx" ON "Liquidacao"("empenhoId");

-- CreateIndex
CREATE INDEX "Liquidacao_estornoDeId_idx" ON "Liquidacao"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacao_empenhoId_numero_key" ON "Liquidacao"("empenhoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_codigo_key" ON "ContaBancaria"("codigo");

-- CreateIndex
CREATE INDEX "ContaBancaria_fonteId_idx" ON "ContaBancaria"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_lancamentoId_key" ON "Pagamento"("lancamentoId");

-- CreateIndex
CREATE INDEX "Pagamento_liquidacaoId_idx" ON "Pagamento"("liquidacaoId");

-- CreateIndex
CREATE INDEX "Pagamento_fonteId_idx" ON "Pagamento"("fonteId");

-- CreateIndex
CREATE INDEX "Pagamento_estornoDeId_idx" ON "Pagamento"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_liquidacaoId_numero_key" ON "Pagamento"("liquidacaoId", "numero");

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
