-- V28 — a conta da liquidação por elemento de despesa, declarada pelo ente (append-only).
CREATE TYPE "EfeitoDaLiquidacao" AS ENUM ('VPD', 'IMOBILIZADO', 'INTANGIVEL', 'BAIXA_DE_PASSIVO');

CREATE TABLE "ContaDaLiquidacaoPorElemento" (
    "id" TEXT NOT NULL,
    "elemento" VARCHAR(2) NOT NULL,
    "efeito" "EfeitoDaLiquidacao" NOT NULL,
    "contaCodigo" VARCHAR(20) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContaDaLiquidacaoPorElemento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContaDaLiquidacaoPorElemento_elemento_versao_idx" ON "ContaDaLiquidacaoPorElemento"("elemento", "versao");

CREATE UNIQUE INDEX "ContaDaLiquidacaoPorElemento_elemento_versao_key" ON "ContaDaLiquidacaoPorElemento"("elemento", "versao");
