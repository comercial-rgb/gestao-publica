-- V26 (ordem, item 2.6) — a norma orçamentária com o protocolo do banco de legislação do TCE-PB, e o PDF do decreto
-- de crédito como anexo do decreto. Aditiva.

-- CreateEnum
CREATE TYPE "TipoDeNormaOrcamentaria" AS ENUM ('LOA', 'CREDITO_SUPLEMENTAR', 'CREDITO_ESPECIAL', 'TRANSPOSICAO');

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "decretoCreditoId" TEXT;

-- CreateTable
CREATE TABLE "NormaOrcamentariaNoTce" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeNormaOrcamentaria" NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "protocoloTce" VARCHAR(9) NOT NULL,
    "autorizacaoPercentual" BOOLEAN NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "leiCreditoId" TEXT,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "NormaOrcamentariaNoTce_pkey" PRIMARY KEY ("id"),
    -- O protocolo vem do Tribunal no formato 000000/00; o número vai ao arquivo com até 5 dígitos.
    CONSTRAINT "NormaOrcamentariaNoTce_protocolo_check" CHECK ("protocoloTce" ~ '^[0-9]{6}/[0-9]{2}$'),
    CONSTRAINT "NormaOrcamentariaNoTce_numero_check" CHECK ("numero" ~ '^[0-9]{1,5}$'),
    CONSTRAINT "NormaOrcamentariaNoTce_valor_check" CHECK ("valor" > 0 AND (NOT "autorizacaoPercentual" OR "valor" <= 100))
);

-- CreateIndex
CREATE INDEX "NormaOrcamentariaNoTce_dataPublicacao_idx" ON "NormaOrcamentariaNoTce"("dataPublicacao");

-- CreateIndex
CREATE UNIQUE INDEX "NormaOrcamentariaNoTce_ano_numero_tipo_key" ON "NormaOrcamentariaNoTce"("ano", "numero", "tipo");

-- AddForeignKey
ALTER TABLE "NormaOrcamentariaNoTce" ADD CONSTRAINT "NormaOrcamentariaNoTce_leiCreditoId_fkey" FOREIGN KEY ("leiCreditoId") REFERENCES "LeiCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_decretoCreditoId_fkey" FOREIGN KEY ("decretoCreditoId") REFERENCES "DecretoCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
