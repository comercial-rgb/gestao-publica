-- M12 — DE-PARAS do RREO Anexo 12 (ASPS). Aditiva: cria DeParaBaseImpostoAsps e DeParaFonteClasseAsps.
-- Nenhuma coluna existente tocada. Rol fechado cresce por decisão; mapa completo = pendência de dado.

-- CreateTable
CREATE TABLE "DeParaBaseImpostoAsps" (
    "id" TEXT NOT NULL,
    "naturezaCodigo" VARCHAR(8) NOT NULL,
    "chave" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaBaseImpostoAsps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaBaseImpostoAsps_chave_idx" ON "DeParaBaseImpostoAsps"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaBaseImpostoAsps_naturezaCodigo_key" ON "DeParaBaseImpostoAsps"("naturezaCodigo");

-- CreateTable
CREATE TABLE "DeParaFonteClasseAsps" (
    "id" TEXT NOT NULL,
    "fonteCodigo" VARCHAR(3) NOT NULL,
    "classe" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaFonteClasseAsps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaFonteClasseAsps_classe_idx" ON "DeParaFonteClasseAsps"("classe");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaFonteClasseAsps_fonteCodigo_key" ON "DeParaFonteClasseAsps"("fonteCodigo");
