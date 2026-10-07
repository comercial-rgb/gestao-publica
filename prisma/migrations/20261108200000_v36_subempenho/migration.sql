-- V36 (TR 5.10.1.7) — subempenho sobre o empenho global ou estimativo. Aditiva.
-- AlterTable
ALTER TABLE "Liquidacao" ADD COLUMN     "subempenhoId" TEXT;

-- CreateTable
CREATE TABLE "Subempenho" (
    "id" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "historico" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Subempenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnulacaoDeSubempenho" (
    "id" TEXT NOT NULL,
    "subempenhoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnulacaoDeSubempenho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subempenho_empenhoId_idx" ON "Subempenho"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "Subempenho_empenhoId_numero_key" ON "Subempenho"("empenhoId", "numero");

-- CreateIndex
CREATE INDEX "AnulacaoDeSubempenho_subempenhoId_idx" ON "AnulacaoDeSubempenho"("subempenhoId");

-- CreateIndex
CREATE INDEX "Liquidacao_subempenhoId_idx" ON "Liquidacao"("subempenhoId");

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_subempenhoId_fkey" FOREIGN KEY ("subempenhoId") REFERENCES "Subempenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subempenho" ADD CONSTRAINT "Subempenho_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnulacaoDeSubempenho" ADD CONSTRAINT "AnulacaoDeSubempenho_subempenhoId_fkey" FOREIGN KEY ("subempenhoId") REFERENCES "Subempenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs que o Prisma não representa.
ALTER TABLE "Subempenho" ADD CONSTRAINT "Subempenho_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "Subempenho" ADD CONSTRAINT "Subempenho_numero_positivo" CHECK ("numero" >= 1);
ALTER TABLE "Subempenho" ADD CONSTRAINT "Subempenho_historico_preenchido" CHECK (length(btrim("historico")) > 0);
ALTER TABLE "AnulacaoDeSubempenho" ADD CONSTRAINT "AnulacaoDeSubempenho_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "AnulacaoDeSubempenho" ADD CONSTRAINT "AnulacaoDeSubempenho_motivo_preenchido" CHECK (length(btrim("motivo")) > 0);
-- O subempenho vai só na liquidação original: a anulação (inteira ou parcial) se liga a ele pela família.
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_subempenho_so_no_original" CHECK ("subempenhoId" IS NULL OR ("estornoDeId" IS NULL AND "anulacaoParcialDeId" IS NULL));
