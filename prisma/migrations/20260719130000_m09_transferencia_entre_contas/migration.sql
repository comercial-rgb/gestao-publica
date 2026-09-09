-- M09 — TransferenciaEntreContas (TR 5.61, SAGRES §4.59). ADITIVA: tabela nova, sem tocar as existentes.
CREATE TABLE "TransferenciaEntreContas" (
    "id" TEXT NOT NULL,
    "contaOrigemId" TEXT NOT NULL,
    "contaDestinoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "codigo" TEXT NOT NULL,
    "historico" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "TransferenciaEntreContas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransferenciaEntreContas_lancamentoId_key" ON "TransferenciaEntreContas"("lancamentoId");
CREATE INDEX "TransferenciaEntreContas_contaOrigemId_idx" ON "TransferenciaEntreContas"("contaOrigemId");
CREATE INDEX "TransferenciaEntreContas_contaDestinoId_idx" ON "TransferenciaEntreContas"("contaDestinoId");
CREATE INDEX "TransferenciaEntreContas_data_idx" ON "TransferenciaEntreContas"("data");
ALTER TABLE "TransferenciaEntreContas" ADD CONSTRAINT "TransferenciaEntreContas_contaOrigemId_fkey" FOREIGN KEY ("contaOrigemId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaEntreContas" ADD CONSTRAINT "TransferenciaEntreContas_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaEntreContas" ADD CONSTRAINT "TransferenciaEntreContas_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
