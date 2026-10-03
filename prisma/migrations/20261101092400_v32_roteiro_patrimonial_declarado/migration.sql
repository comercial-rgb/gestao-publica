-- V32 — o roteiro de precatório e de convênio declarado pelo ente (append-only, versionado).
CREATE TABLE "RoteiroPatrimonialDeclarado" (
    "id" TEXT NOT NULL,
    "familia" VARCHAR(20) NOT NULL,
    "chave" VARCHAR(60) NOT NULL,
    "contaDebitoCodigo" VARCHAR(20) NOT NULL,
    "contaCreditoCodigo" VARCHAR(20) NOT NULL,
    "historicoPadrao" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroPatrimonialDeclarado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoteiroPatrimonialDeclarado_familia_chave_versao_idx" ON "RoteiroPatrimonialDeclarado"("familia", "chave", "versao");

CREATE UNIQUE INDEX "RoteiroPatrimonialDeclarado_familia_chave_versao_key" ON "RoteiroPatrimonialDeclarado"("familia", "chave", "versao");
