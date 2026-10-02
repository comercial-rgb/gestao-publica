-- V27 — as licitações como o TCE-PB as publica nos dados abertos (UG, número, protocolo do Tramita, modalidade), e a
-- identificação no Tramita passa a guardar o protocolo e o registro de onde foi tirada. Aditiva.

-- AlterTable
ALTER TABLE "IdentificacaoNoTramita" ADD COLUMN     "licitacaoNoTribunalId" TEXT,
ADD COLUMN     "protocoloNoTribunal" VARCHAR(16);

-- CreateTable
CREATE TABLE "LicitacaoNoTribunal" (
    "id" TEXT NOT NULL,
    "arquivoHash" VARCHAR(64) NOT NULL,
    "codUnidadeGestora" VARCHAR(6) NOT NULL,
    "numeroLicitacao" VARCHAR(10) NOT NULL,
    "protocoloTce" VARCHAR(16) NOT NULL,
    "ano" INTEGER NOT NULL,
    "modalidadeTexto" TEXT NOT NULL,
    "modalidadeSagres" VARCHAR(2),
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT NOT NULL,

    CONSTRAINT "LicitacaoNoTribunal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LicitacaoNoTribunal_codUnidadeGestora_numeroLicitacao_idx" ON "LicitacaoNoTribunal"("codUnidadeGestora", "numeroLicitacao");

-- CreateIndex
CREATE UNIQUE INDEX "LicitacaoNoTribunal_arquivoHash_codUnidadeGestora_numeroLic_key" ON "LicitacaoNoTribunal"("arquivoHash", "codUnidadeGestora", "numeroLicitacao", "modalidadeTexto");

-- AddForeignKey
ALTER TABLE "IdentificacaoNoTramita" ADD CONSTRAINT "IdentificacaoNoTramita_licitacaoNoTribunalId_fkey" FOREIGN KEY ("licitacaoNoTribunalId") REFERENCES "LicitacaoNoTribunal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CHECKs: os formatos medidos no arquivo do Tribunal (130 licitações de 2026 de Esperança) ──
ALTER TABLE "LicitacaoNoTribunal" ADD CONSTRAINT "LicitacaoNoTribunal_ug_check" CHECK ("codUnidadeGestora" ~ '^[0-9]{6}$');
ALTER TABLE "LicitacaoNoTribunal" ADD CONSTRAINT "LicitacaoNoTribunal_numero_check" CHECK ("numeroLicitacao" ~ '^[0-9]{5}/[0-9]{4}$');
ALTER TABLE "LicitacaoNoTribunal" ADD CONSTRAINT "LicitacaoNoTribunal_protocolo_check" CHECK ("protocoloTce" ~ '^Doc\. [0-9]{1,8}/[0-9]{2}$');
ALTER TABLE "LicitacaoNoTribunal" ADD CONSTRAINT "LicitacaoNoTribunal_hash_check" CHECK ("arquivoHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "IdentificacaoNoTramita" ADD CONSTRAINT "IdentificacaoNoTramita_protocolo_check" CHECK ("protocoloNoTribunal" IS NULL OR "protocoloNoTribunal" ~ '^Doc\. [0-9]{1,8}/[0-9]{2}$');
