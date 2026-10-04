-- V35 — o parâmetro do limite do repasse ao Legislativo (CF art. 29-A): população e base declarada, por versão.
-- Aditiva: uma tabela e um índice único. Nada é removido.

-- CreateTable
CREATE TABLE "ParametroDoLimiteDoLegislativo" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "populacao" INTEGER NOT NULL,
    "fontePopulacao" TEXT NOT NULL,
    "baseDeclarada" DECIMAL(18,2),
    "documentoDaBase" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParametroDoLimiteDoLegislativo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParametroDoLimiteDoLegislativo_exercicio_versao_key" ON "ParametroDoLimiteDoLegislativo"("exercicio", "versao");
