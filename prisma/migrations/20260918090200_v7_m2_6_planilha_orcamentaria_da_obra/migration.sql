-- V7 M2 U6 — A PLANILHA ORÇAMENTÁRIA DA OBRA: prévia com o arquivo original, versões confirmadas, itens e o vínculo
-- explícito com itens do contrato. Aditiva: nenhuma obra, contrato ou medição existente muda.

-- CreateEnum
CREATE TYPE "FormatoDePlanilha" AS ENUM ('XLSX', 'XLS');

-- CreateEnum
CREATE TYPE "TipoDoItemDaPlanilha" AS ENUM ('GRUPO', 'SERVICO');


-- CreateTable
CREATE TABLE "PreviaDePlanilhaOrcamentaria" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "nomeDoArquivo" TEXT NOT NULL,
    "formato" "FormatoDePlanilha" NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "aba" TEXT NOT NULL,
    "linhaDoCabecalho" INTEGER NOT NULL,
    "mapeamento" JSONB NOT NULL,
    "analise" JSONB NOT NULL,
    "erros" INTEGER NOT NULL,
    "divergencias" INTEGER NOT NULL,
    "totalCalculado" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PreviaDePlanilhaOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanilhaOrcamentariaDaObra" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "contratoId" TEXT,
    "previaId" TEXT NOT NULL,
    "versaoAnteriorId" TEXT,
    "descricao" TEXT NOT NULL,
    "dataBaseDosPrecos" TIMESTAMP(3) NOT NULL,
    "referenciaDePrecos" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "divergenciasCientes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PlanilhaOrcamentariaDaObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaPlanilhaOrcamentaria" (
    "id" TEXT NOT NULL,
    "planilhaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigoDoPai" TEXT,
    "nivel" INTEGER NOT NULL,
    "tipo" "TipoDoItemDaPlanilha" NOT NULL,
    "referencia" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DECIMAL(18,4),
    "precoUnitario" DECIMAL(18,4),
    "valor" DECIMAL(18,2) NOT NULL,
    "valorNoArquivo" DECIMAL(18,2),
    "linhaDoArquivo" INTEGER NOT NULL,

    CONSTRAINT "ItemDaPlanilhaOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoDeItemDaPlanilhaAoContrato" (
    "id" TEXT NOT NULL,
    "itemDaPlanilhaId" TEXT NOT NULL,
    "itemDoContratoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VinculoDeItemDaPlanilhaAoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevogacaoDeVinculoDaPlanilha" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RevogacaoDeVinculoDaPlanilha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreviaDePlanilhaOrcamentaria_obraId_idx" ON "PreviaDePlanilhaOrcamentaria"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanilhaOrcamentariaDaObra_previaId_key" ON "PlanilhaOrcamentariaDaObra"("previaId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanilhaOrcamentariaDaObra_versaoAnteriorId_key" ON "PlanilhaOrcamentariaDaObra"("versaoAnteriorId");

-- CreateIndex
CREATE INDEX "PlanilhaOrcamentariaDaObra_contratoId_idx" ON "PlanilhaOrcamentariaDaObra"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanilhaOrcamentariaDaObra_obraId_versao_key" ON "PlanilhaOrcamentariaDaObra"("obraId", "versao");

-- CreateIndex
CREATE INDEX "ItemDaPlanilhaOrcamentaria_planilhaId_ordem_idx" ON "ItemDaPlanilhaOrcamentaria"("planilhaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaPlanilhaOrcamentaria_planilhaId_codigo_key" ON "ItemDaPlanilhaOrcamentaria"("planilhaId", "codigo");

-- CreateIndex
CREATE INDEX "VinculoDeItemDaPlanilhaAoContrato_itemDaPlanilhaId_idx" ON "VinculoDeItemDaPlanilhaAoContrato"("itemDaPlanilhaId");

-- CreateIndex
CREATE INDEX "VinculoDeItemDaPlanilhaAoContrato_itemDoContratoId_idx" ON "VinculoDeItemDaPlanilhaAoContrato"("itemDoContratoId");

-- CreateIndex
CREATE UNIQUE INDEX "RevogacaoDeVinculoDaPlanilha_vinculoId_key" ON "RevogacaoDeVinculoDaPlanilha"("vinculoId");

-- AddForeignKey
ALTER TABLE "PreviaDePlanilhaOrcamentaria" ADD CONSTRAINT "PreviaDePlanilhaOrcamentaria_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanilhaOrcamentariaDaObra" ADD CONSTRAINT "PlanilhaOrcamentariaDaObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanilhaOrcamentariaDaObra" ADD CONSTRAINT "PlanilhaOrcamentariaDaObra_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanilhaOrcamentariaDaObra" ADD CONSTRAINT "PlanilhaOrcamentariaDaObra_previaId_fkey" FOREIGN KEY ("previaId") REFERENCES "PreviaDePlanilhaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanilhaOrcamentariaDaObra" ADD CONSTRAINT "PlanilhaOrcamentariaDaObra_versaoAnteriorId_fkey" FOREIGN KEY ("versaoAnteriorId") REFERENCES "PlanilhaOrcamentariaDaObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaPlanilhaOrcamentaria" ADD CONSTRAINT "ItemDaPlanilhaOrcamentaria_planilhaId_fkey" FOREIGN KEY ("planilhaId") REFERENCES "PlanilhaOrcamentariaDaObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoDeItemDaPlanilhaAoContrato" ADD CONSTRAINT "VinculoDeItemDaPlanilhaAoContrato_itemDaPlanilhaId_fkey" FOREIGN KEY ("itemDaPlanilhaId") REFERENCES "ItemDaPlanilhaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoDeItemDaPlanilhaAoContrato" ADD CONSTRAINT "VinculoDeItemDaPlanilhaAoContrato_itemDoContratoId_fkey" FOREIGN KEY ("itemDoContratoId") REFERENCES "ItemDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevogacaoDeVinculoDaPlanilha" ADD CONSTRAINT "RevogacaoDeVinculoDaPlanilha_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "VinculoDeItemDaPlanilhaAoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas que o Prisma não expressa: valores e níveis coerentes; o serviço tem unidade, quantidade e preço; o grupo não.
ALTER TABLE "ItemDaPlanilhaOrcamentaria" ADD CONSTRAINT "ck_item_da_planilha_orcamentaria" CHECK (
  "nivel" >= 1 AND "ordem" >= 1 AND "valor" >= 0 AND length(btrim("codigo")) >= 1 AND length(btrim("descricao")) >= 1
  AND (("tipo" = 'SERVICO' AND "unidade" IS NOT NULL AND "quantidade" >= 0 AND "precoUnitario" >= 0)
    OR ("tipo" = 'GRUPO' AND "quantidade" IS NULL AND "precoUnitario" IS NULL))
);
ALTER TABLE "PlanilhaOrcamentariaDaObra" ADD CONSTRAINT "ck_planilha_orcamentaria_da_obra" CHECK (
  "versao" >= 1 AND "valorTotal" >= 0 AND "divergenciasCientes" >= 0
  AND (("versao" = 1) = ("versaoAnteriorId" IS NULL))
);
