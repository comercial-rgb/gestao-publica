-- V39-R3 (R3-020, M11) — a pesquisa de precos com o parametro, a data e o documento de cada preco, a regra do minimo de
-- precos (carregada do texto oficial) e o preco estimado fixado com a memoria. Aditiva: dois enums, colunas anulaveis e
-- duas tabelas append-only; os CHECKs de prisma/sql/ck_pesquisa_de_precos.sql.

-- CreateEnum
CREATE TYPE "ParametroDaPesquisaDePrecos" AS ENUM ('PAINEL_DE_PRECOS', 'CONTRATACOES_SIMILARES', 'MIDIA_TABELAS_E_SITIOS', 'FORNECEDORES', 'NOTAS_FISCAIS');

-- CreateEnum
CREATE TYPE "MetodoDoPrecoEstimado" AS ENUM ('MEDIA', 'MEDIANA', 'MENOR');

-- AlterTable
ALTER TABLE "CotacaoDePreco" ADD COLUMN     "dataDoPreco" TIMESTAMP(3),
ADD COLUMN     "documento" TEXT,
ADD COLUMN     "parametro" "ParametroDaPesquisaDePrecos";

-- CreateTable
CREATE TABLE "RegraDaPesquisaDePrecos" (
    "id" TEXT NOT NULL,
    "minimoDePrecos" INTEGER NOT NULL,
    "fonte" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RegraDaPesquisaDePrecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoEstimadoDoItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "metodo" "MetodoDoPrecoEstimado" NOT NULL,
    "valorEstimado" DECIMAL(18,6) NOT NULL,
    "precosUsados" INTEGER NOT NULL,
    "memoria" JSONB NOT NULL,
    "descartes" JSONB NOT NULL,
    "justificativaMenosPrecos" TEXT,
    "regraId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PrecoEstimadoDoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegraDaPesquisaDePrecos_vigenteDesde_key" ON "RegraDaPesquisaDePrecos"("vigenteDesde");

-- CreateIndex
CREATE INDEX "PrecoEstimadoDoItem_itemId_criadoEm_idx" ON "PrecoEstimadoDoItem"("itemId", "criadoEm");

-- AddForeignKey
ALTER TABLE "PrecoEstimadoDoItem" ADD CONSTRAINT "PrecoEstimadoDoItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDePesquisaDePrecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoEstimadoDoItem" ADD CONSTRAINT "PrecoEstimadoDoItem_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "RegraDaPesquisaDePrecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_preco_estimado') THEN
    ALTER TABLE "PrecoEstimadoDoItem" ADD CONSTRAINT "ck_preco_estimado" CHECK ("valorEstimado" > 0 AND "precosUsados" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_regra_da_pesquisa') THEN
    ALTER TABLE "RegraDaPesquisaDePrecos" ADD CONSTRAINT "ck_regra_da_pesquisa" CHECK ("minimoDePrecos" >= 1 AND length(btrim("fonte")) > 0);
  END IF;
END $$;
