-- M12 — DE-PARAS do RREO Anexo 8 (MDE). Aditiva: cria DeParaFundebReceita e DeParaFonteClasseEducacao.
-- Nenhuma coluna existente tocada. Rol fechado cresce por decisão; mapa completo = pendência de dado.

-- CreateTable
CREATE TABLE "DeParaFundebReceita" (
    "id" TEXT NOT NULL,
    "naturezaCodigo" VARCHAR(8) NOT NULL,
    "papel" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaFundebReceita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaFundebReceita_papel_idx" ON "DeParaFundebReceita"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaFundebReceita_naturezaCodigo_key" ON "DeParaFundebReceita"("naturezaCodigo");

-- CreateTable
CREATE TABLE "DeParaFonteClasseEducacao" (
    "id" TEXT NOT NULL,
    "fonteCodigo" VARCHAR(3) NOT NULL,
    "classe" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaFonteClasseEducacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaFonteClasseEducacao_classe_idx" ON "DeParaFonteClasseEducacao"("classe");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaFonteClasseEducacao_fonteCodigo_key" ON "DeParaFonteClasseEducacao"("fonteCodigo");
