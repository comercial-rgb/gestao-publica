-- V36 (TR 5.10.1.84): o cronograma de parcelas INFORMADO da dívida fundada. Aditiva: tabela nova, sem backfill.
CREATE TABLE "ParcelaDaDivida" (
    "id" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valorPrincipal" DECIMAL(18,2) NOT NULL,
    "valorEncargos" DECIMAL(18,2),
    "substituiDeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParcelaDaDivida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParcelaDaDivida_substituiDeId_key" ON "ParcelaDaDivida"("substituiDeId");
CREATE INDEX "ParcelaDaDivida_dividaId_numero_idx" ON "ParcelaDaDivida"("dividaId", "numero");

ALTER TABLE "ParcelaDaDivida" ADD CONSTRAINT "ParcelaDaDivida_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParcelaDaDivida" ADD CONSTRAINT "ParcelaDaDivida_substituiDeId_fkey" FOREIGN KEY ("substituiDeId") REFERENCES "ParcelaDaDivida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
