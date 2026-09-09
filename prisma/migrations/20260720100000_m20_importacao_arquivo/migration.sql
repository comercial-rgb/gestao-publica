-- M20 — importadores de arquivo externo (folha/tributário). ADITIVA (1 enum novo + tabela nova).
CREATE TYPE "TipoImportacao" AS ENUM ('FOLHA', 'TRIBUTOS');
CREATE TABLE "ImportacaoArquivo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoImportacao" NOT NULL,
    "arquivoHash" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "linhas" INTEGER NOT NULL,
    "fatosGerados" INTEGER NOT NULL,
    "correlationId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ImportacaoArquivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ImportacaoArquivo_arquivoHash_key" ON "ImportacaoArquivo"("arquivoHash");
CREATE UNIQUE INDEX "ImportacaoArquivo_correlationId_key" ON "ImportacaoArquivo"("correlationId");
CREATE INDEX "ImportacaoArquivo_tipo_idx" ON "ImportacaoArquivo"("tipo");
CREATE INDEX "ImportacaoArquivo_criadoEm_idx" ON "ImportacaoArquivo"("criadoEm");
