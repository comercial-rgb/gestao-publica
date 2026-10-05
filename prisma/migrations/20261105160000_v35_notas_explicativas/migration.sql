-- V35 C2 — notas explicativas às DCASP (MCASP 11ª ed., Parte V, item 8). Aditiva.
CREATE TYPE "SecaoDaNotaExplicativa" AS ENUM ('INFORMACOES_GERAIS', 'POLITICAS_CONTABEIS', 'DETALHAMENTO', 'OUTRAS_INFORMACOES');

CREATE TYPE "DemonstracaoDaNota" AS ENUM ('BALANCO_ORCAMENTARIO', 'BALANCO_FINANCEIRO', 'BALANCO_PATRIMONIAL', 'DVP', 'DFC', 'DMPL', 'CONJUNTO');

CREATE TABLE "NotaExplicativa" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "chave" VARCHAR(40) NOT NULL,
    "versao" INTEGER NOT NULL,
    "secao" "SecaoDaNotaExplicativa" NOT NULL,
    "demonstracao" "DemonstracaoDaNota" NOT NULL,
    "ordem" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "retirada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "NotaExplicativa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotaExplicativa_exercicio_chave_idx" ON "NotaExplicativa"("exercicio", "chave");

CREATE UNIQUE INDEX "NotaExplicativa_exercicio_chave_versao_key" ON "NotaExplicativa"("exercicio", "chave", "versao");
