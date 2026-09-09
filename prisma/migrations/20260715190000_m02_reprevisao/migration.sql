-- M02 — Reprevisão de receita (append-only). Aditiva: só cria a tabela ReceitaReprevista.
-- Nenhuma coluna existente tocada. Ajuste gerencial, sem razão.

-- CreateTable
CREATE TABLE "ReceitaReprevista" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "naturezaCodigo" VARCHAR(8) NOT NULL,
    "fonteCodigo" VARCHAR(3) NOT NULL,
    "tipoReceita" TEXT NOT NULL,
    "valorAjuste" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceitaReprevista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceitaReprevista_exercicio_idx" ON "ReceitaReprevista"("exercicio");

-- CreateIndex
CREATE INDEX "ReceitaReprevista_exercicio_naturezaCodigo_idx" ON "ReceitaReprevista"("exercicio", "naturezaCodigo");
