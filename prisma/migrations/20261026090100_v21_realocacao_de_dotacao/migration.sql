-- V21 — o ATO DE REALOCAÇÃO, as pernas e a anulação. Aditivo: três tabelas e dois enums novos,
-- nenhuma coluna de tabela existente tocada. Append-only: nenhuma delas entra no censo de
-- escrita mutável do papel de runtime (`prisma/papel-runtime.ts`) — só INSERT e SELECT.
-- A unicidade do estorno de cada perna é o índice único de `estornoDeId`, declarado no schema.

-- CreateEnum
CREATE TYPE "EspecieDeRealocacao" AS ENUM ('REMANEJAMENTO', 'TRANSPOSICAO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoPernaDeRealocacao" AS ENUM ('ACRESCIMO', 'REDUCAO');

-- CreateTable
CREATE TABLE "AtoDeRealocacao" (
    "id" TEXT NOT NULL,
    "especie" "EspecieDeRealocacao" NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "leiNumero" TEXT NOT NULL,
    "leiDataPublicacao" TIMESTAMP(3) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtoDeRealocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeRealocacao" (
    "id" TEXT NOT NULL,
    "atoId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "tipo" "TipoPernaDeRealocacao" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "fonteId" TEXT NOT NULL,
    "movimentoDotacaoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeRealocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnulacaoDeRealocacao" (
    "id" TEXT NOT NULL,
    "atoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnulacaoDeRealocacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtoDeRealocacao_ano_idx" ON "AtoDeRealocacao"("ano");

-- CreateIndex
CREATE UNIQUE INDEX "AtoDeRealocacao_ano_numero_key" ON "AtoDeRealocacao"("ano", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDeRealocacao_movimentoDotacaoId_key" ON "ItemDeRealocacao"("movimentoDotacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDeRealocacao_estornoDeId_key" ON "ItemDeRealocacao"("estornoDeId");

-- CreateIndex
CREATE INDEX "ItemDeRealocacao_atoId_idx" ON "ItemDeRealocacao"("atoId");

-- CreateIndex
CREATE INDEX "ItemDeRealocacao_fichaId_idx" ON "ItemDeRealocacao"("fichaId");

-- CreateIndex
CREATE UNIQUE INDEX "AnulacaoDeRealocacao_atoId_key" ON "AnulacaoDeRealocacao"("atoId");

ALTER TABLE "ItemDeRealocacao" ADD CONSTRAINT "ItemDeRealocacao_atoId_fkey" FOREIGN KEY ("atoId") REFERENCES "AtoDeRealocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ItemDeRealocacao" ADD CONSTRAINT "ItemDeRealocacao_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ItemDeRealocacao" ADD CONSTRAINT "ItemDeRealocacao_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ItemDeRealocacao" ADD CONSTRAINT "ItemDeRealocacao_movimentoDotacaoId_fkey" FOREIGN KEY ("movimentoDotacaoId") REFERENCES "MovimentoDotacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ItemDeRealocacao" ADD CONSTRAINT "ItemDeRealocacao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "ItemDeRealocacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnulacaoDeRealocacao" ADD CONSTRAINT "AnulacaoDeRealocacao_atoId_fkey" FOREIGN KEY ("atoId") REFERENCES "AtoDeRealocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

