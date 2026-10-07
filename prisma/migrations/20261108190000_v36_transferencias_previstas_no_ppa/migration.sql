-- CreateTable
CREATE TABLE "PrevisaoDeTransferenciaPpa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "finalidade" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrevisaoDeTransferenciaPpa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrevisaoDeTransferenciaPpa_entidadeId_idx" ON "PrevisaoDeTransferenciaPpa"("entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "PrevisaoDeTransferenciaPpa_planoId_entidadeId_ano_versao_key" ON "PrevisaoDeTransferenciaPpa"("planoId", "entidadeId", "ano", "versao");

-- AddForeignKey
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_entidadeId_fkey" FOREIGN KEY ("entidadeId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- V36 (TR 5.9.1.17) — valor não negativo e positivo na primeira versão; versão a partir de 1; a correção tem motivo;
-- finalidade não vazia.
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_valor_check" CHECK ("valor" >= 0 AND ("versao" > 1 OR "valor" > 0));
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_motivo_check" CHECK ("versao" = 1 OR ("motivo" IS NOT NULL AND btrim("motivo") <> ''));
ALTER TABLE "PrevisaoDeTransferenciaPpa" ADD CONSTRAINT "PrevisaoDeTransferenciaPpa_finalidade_check" CHECK (btrim("finalidade") <> '');
