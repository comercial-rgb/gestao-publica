-- V28 — a VPA da arrecadação por natureza de receita, declarada pelo ente (append-only).
CREATE TABLE "ContaDaReceitaPorNatureza" (
    "id" TEXT NOT NULL,
    "naturezaPrefixo" VARCHAR(8) NOT NULL,
    "contaVpaCodigo" VARCHAR(20) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContaDaReceitaPorNatureza_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContaDaReceitaPorNatureza_naturezaPrefixo_versao_idx" ON "ContaDaReceitaPorNatureza"("naturezaPrefixo", "versao");

CREATE UNIQUE INDEX "ContaDaReceitaPorNatureza_naturezaPrefixo_versao_key" ON "ContaDaReceitaPorNatureza"("naturezaPrefixo", "versao");
