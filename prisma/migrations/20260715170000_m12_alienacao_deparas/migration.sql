-- M12 — DE-PARAS do RREO Anexo 11 (Alienação). Aditiva: cria DeParaReceitaAlienacao e DeParaFonteAlienacao.
-- Nenhuma coluna existente tocada. Rol fechado; fonte de alienação = interruptor nomeado.

-- CreateTable
CREATE TABLE "DeParaReceitaAlienacao" (
    "id" TEXT NOT NULL,
    "naturezaCodigo" VARCHAR(8) NOT NULL,
    "chave" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaReceitaAlienacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaReceitaAlienacao_chave_idx" ON "DeParaReceitaAlienacao"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaReceitaAlienacao_naturezaCodigo_key" ON "DeParaReceitaAlienacao"("naturezaCodigo");

-- CreateTable
CREATE TABLE "DeParaFonteAlienacao" (
    "id" TEXT NOT NULL,
    "fonteCodigo" VARCHAR(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaFonteAlienacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeParaFonteAlienacao_fonteCodigo_key" ON "DeParaFonteAlienacao"("fonteCodigo");
