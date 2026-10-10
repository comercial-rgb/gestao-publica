-- V39-R2 (R2-021, R2-022, M02b) — o registro da importação da LDO e da preparação do PPA seguinte, com a origem de cada
-- linha copiada. Aditiva: quatro tabelas novas, append-only.
-- CreateTable
CREATE TABLE "ImportacaoDaLdo" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "blocos" TEXT[],
    "anos" JSONB NOT NULL,
    "versaoDaPrevia" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ImportacaoDaLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemImportadoDaLdo" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "bloco" VARCHAR(30) NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,

    CONSTRAINT "ItemImportadoDaLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoDoPpa" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "versaoDaOrigemAtoId" TEXT,
    "blocos" TEXT[],
    "anos" JSONB NOT NULL,
    "versaoDaPrevia" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ImportacaoDoPpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemImportadoDoPpa" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "bloco" VARCHAR(30) NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,

    CONSTRAINT "ItemImportadoDoPpa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportacaoDaLdo_origemId_idx" ON "ImportacaoDaLdo"("origemId");

-- CreateIndex
CREATE INDEX "ImportacaoDaLdo_destinoId_idx" ON "ImportacaoDaLdo"("destinoId");

-- CreateIndex
CREATE INDEX "ItemImportadoDaLdo_destinoId_idx" ON "ItemImportadoDaLdo"("destinoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemImportadoDaLdo_importacaoId_bloco_origemId_key" ON "ItemImportadoDaLdo"("importacaoId", "bloco", "origemId");

-- CreateIndex
CREATE INDEX "ImportacaoDoPpa_origemId_idx" ON "ImportacaoDoPpa"("origemId");

-- CreateIndex
CREATE INDEX "ImportacaoDoPpa_destinoId_idx" ON "ImportacaoDoPpa"("destinoId");

-- CreateIndex
CREATE INDEX "ItemImportadoDoPpa_destinoId_idx" ON "ItemImportadoDoPpa"("destinoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemImportadoDoPpa_importacaoId_bloco_origemId_key" ON "ItemImportadoDoPpa"("importacaoId", "bloco", "origemId");

-- AddForeignKey
ALTER TABLE "ImportacaoDaLdo" ADD CONSTRAINT "ImportacaoDaLdo_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDaLdo" ADD CONSTRAINT "ImportacaoDaLdo_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemImportadoDaLdo" ADD CONSTRAINT "ItemImportadoDaLdo_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoDaLdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDoPpa" ADD CONSTRAINT "ImportacaoDoPpa_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDoPpa" ADD CONSTRAINT "ImportacaoDoPpa_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoDoPpa" ADD CONSTRAINT "ImportacaoDoPpa_versaoDaOrigemAtoId_fkey" FOREIGN KEY ("versaoDaOrigemAtoId") REFERENCES "AtoDeAlteracaoDoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemImportadoDoPpa" ADD CONSTRAINT "ItemImportadoDoPpa_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoDoPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

