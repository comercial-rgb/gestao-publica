-- V36 — a parceria público-privada: tipo, situação e parcelas (TR 5.10.1.87), anexos (5.10.1.88) e o vínculo com o empenho (5.10.1.89). Aditiva.

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "contratoPppId" TEXT;

-- AlterTable
ALTER TABLE "ContratoPPP" ADD COLUMN     "tipo" VARCHAR(15);

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "contratoPppId" TEXT;

-- CreateTable
CREATE TABLE "SituacaoDaPpp" (
    "id" TEXT NOT NULL,
    "contratoPppId" TEXT NOT NULL,
    "situacao" VARCHAR(15) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SituacaoDaPpp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelaDaPpp" (
    "id" TEXT NOT NULL,
    "contratoPppId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParcelaDaPpp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SituacaoDaPpp_contratoPppId_data_idx" ON "SituacaoDaPpp"("contratoPppId", "data");

-- CreateIndex
CREATE INDEX "ParcelaDaPpp_contratoPppId_ano_idx" ON "ParcelaDaPpp"("contratoPppId", "ano");

-- CreateIndex
CREATE INDEX "Anexo_contratoPppId_idx" ON "Anexo"("contratoPppId");

-- CreateIndex
CREATE INDEX "Empenho_contratoPppId_idx" ON "Empenho"("contratoPppId");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_contratoPppId_fkey" FOREIGN KEY ("contratoPppId") REFERENCES "ContratoPPP"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituacaoDaPpp" ADD CONSTRAINT "SituacaoDaPpp_contratoPppId_fkey" FOREIGN KEY ("contratoPppId") REFERENCES "ContratoPPP"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaDaPpp" ADD CONSTRAINT "ParcelaDaPpp_contratoPppId_fkey" FOREIGN KEY ("contratoPppId") REFERENCES "ContratoPPP"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_contratoPppId_fkey" FOREIGN KEY ("contratoPppId") REFERENCES "ContratoPPP"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ContratoPPP" ADD CONSTRAINT "ContratoPPP_tipo_check" CHECK ("tipo" IS NULL OR "tipo" IN ('PATROCINADA', 'ADMINISTRATIVA'));
ALTER TABLE "SituacaoDaPpp" ADD CONSTRAINT "SituacaoDaPpp_situacao_check" CHECK ("situacao" IN ('EM_EXECUCAO', 'SUSPENSA', 'ENCERRADA', 'RESCINDIDA'));
ALTER TABLE "ParcelaDaPpp" ADD CONSTRAINT "ParcelaDaPpp_valor_check" CHECK ("valor" >= 0);
