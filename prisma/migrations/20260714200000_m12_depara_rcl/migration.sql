-- M12 — DE-PARA da RCL (RREO Anexo 3). Aditiva: só cria a tabela DeParaRclAnexo3.
-- Nenhuma coluna existente tocada. O mapa MDF completo é pendência de DADO (seed do ente).

-- CreateTable
CREATE TABLE "DeParaRclAnexo3" (
    "id" TEXT NOT NULL,
    "naturezaCodigo" VARCHAR(8) NOT NULL,
    "chaveLinha" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaRclAnexo3_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaRclAnexo3_chaveLinha_idx" ON "DeParaRclAnexo3"("chaveLinha");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaRclAnexo3_naturezaCodigo_key" ON "DeParaRclAnexo3"("naturezaCodigo");

