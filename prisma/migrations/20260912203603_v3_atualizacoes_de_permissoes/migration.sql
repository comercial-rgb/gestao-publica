-- CreateTable
--
-- Orquestracao V3, 4.2 - o registro das atualizacoes versionadas de permissoes. ADITIVA:
-- tabela nova, sem tocar em nada existente. Zero DROP.
CREATE TABLE "AtualizacaoDePermissoes" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "aplicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadaPor" TEXT NOT NULL,
    "concessoes" INTEGER NOT NULL,
    "detalhe" TEXT NOT NULL,

    CONSTRAINT "AtualizacaoDePermissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtualizacaoDePermissoes_versao_key" ON "AtualizacaoDePermissoes"("versao");
