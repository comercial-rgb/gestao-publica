-- V39-R3 (R3-017, M05) — a referencia externa do empenho (declarada) e a conferencia dela (outro fato, outra pessoa).
-- Aditiva: duas tabelas e um enum novos, append-only, e os CHECKs de prisma/sql/ck_referencia_externa_do_empenho.sql.

-- CreateEnum
CREATE TYPE "ResultadoDaConferenciaDaReferencia" AS ENUM ('CONFIRMADA', 'DIVERGENTE');

-- CreateTable
CREATE TABLE "ReferenciaExternaDoEmpenho" (
    "id" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "sistemaDeOrigem" VARCHAR(80) NOT NULL,
    "identificador" VARCHAR(80) NOT NULL,
    "documento" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ReferenciaExternaDoEmpenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenciaDaReferenciaExterna" (
    "id" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "resultado" "ResultadoDaConferenciaDaReferencia" NOT NULL,
    "meio" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConferenciaDaReferenciaExterna_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenciaExternaDoEmpenho_empenhoId_idx" ON "ReferenciaExternaDoEmpenho"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenciaExternaDoEmpenho_empenhoId_sistemaDeOrigem_identi_key" ON "ReferenciaExternaDoEmpenho"("empenhoId", "sistemaDeOrigem", "identificador");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenciaDaReferenciaExterna_referenciaId_key" ON "ConferenciaDaReferenciaExterna"("referenciaId");

-- AddForeignKey
ALTER TABLE "ReferenciaExternaDoEmpenho" ADD CONSTRAINT "ReferenciaExternaDoEmpenho_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaDaReferenciaExterna" ADD CONSTRAINT "ConferenciaDaReferenciaExterna_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "ReferenciaExternaDoEmpenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_referencia_externa_do_empenho') THEN
    ALTER TABLE "ReferenciaExternaDoEmpenho" ADD CONSTRAINT "ck_referencia_externa_do_empenho" CHECK (length(btrim("sistemaDeOrigem")) > 0 AND length(btrim("identificador")) > 0 AND length(btrim("documento")) > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_conferencia_da_referencia_externa') THEN
    ALTER TABLE "ConferenciaDaReferenciaExterna" ADD CONSTRAINT "ck_conferencia_da_referencia_externa" CHECK (length(btrim("meio")) > 0);
  END IF;
END $$;
