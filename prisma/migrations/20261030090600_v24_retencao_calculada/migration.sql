-- V24 — retenção na fonte CALCULADA (IR, INSS, ISS): tabelas normativas com fonte e vigência,
-- perfil fiscal do fornecedor e a memória de cada cálculo. Aditiva: três enums e sete tabelas novas.

-- CreateEnum
CREATE TYPE "TributoRetido" AS ENUM ('IRRF', 'INSS', 'ISS');

-- CreateEnum
CREATE TYPE "LocalDeIncidenciaDoISS" AS ENUM ('ESTABELECIMENTO_DO_PRESTADOR', 'ESTABELECIMENTO_DO_TOMADOR', 'LOCAL_DA_PRESTACAO');

-- CreateEnum
CREATE TYPE "ResultadoDaRetencao" AS ENUM ('RETIDO', 'NAO_RETIDO', 'INFORMADO');

-- CreateTable
CREATE TABLE "NaturezaDaRetencaoDoIR" (
    "id" TEXT NOT NULL,
    "codigoReceita" VARCHAR(4) NOT NULL,
    "natureza" TEXT NOT NULL,
    "aliquota" DECIMAL(9,6) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "fonte" TEXT NOT NULL,
    "consultadoEm" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "NaturezaDaRetencaoDoIR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicoDaRetencaoPrevidenciaria" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "artigo" INTEGER NOT NULL,
    "inciso" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "somenteCessaoDeMaoDeObra" BOOLEAN NOT NULL,
    "construcaoCivil" BOOLEAN NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "fonte" TEXT NOT NULL,
    "consultadoEm" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ServicoDaRetencaoPrevidenciaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroDaRetencaoPrevidenciaria" (
    "id" TEXT NOT NULL,
    "aliquota" DECIMAL(9,6) NOT NULL,
    "valorMinimo" DECIMAL(15,2) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "fonte" TEXT NOT NULL,
    "consultadoEm" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParametroDaRetencaoPrevidenciaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseMinimaDaRetencaoPrevidenciaria" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "percentual" DECIMAL(9,6) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "fonte" TEXT NOT NULL,
    "consultadoEm" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BaseMinimaDaRetencaoPrevidenciaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaListaDoISS" (
    "id" TEXT NOT NULL,
    "municipioIbge" VARCHAR(7) NOT NULL,
    "subitem" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "aliquota" DECIMAL(9,6) NOT NULL,
    "localDeIncidencia" "LocalDeIncidenciaDoISS" NOT NULL,
    "marcadoRetencaoNaFonte" BOOLEAN NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "fonte" TEXT NOT NULL,
    "consultadoEm" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDaListaDoISS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilFiscalDoFornecedor" (
    "id" TEXT NOT NULL,
    "documento" VARCHAR(14) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "optanteSimplesNacional" BOOLEAN NOT NULL,
    "tributadoNoAnexoIVDoSimples" BOOLEAN NOT NULL,
    "contribuiSobreReceitaBruta" BOOLEAN NOT NULL,
    "dispensaDoIR" TEXT,
    "municipioDoEstabelecimento" VARCHAR(7),
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PerfilFiscalDoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculoDaRetencao" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "tributo" "TributoRetido" NOT NULL,
    "resultado" "ResultadoDaRetencao" NOT NULL,
    "base" DECIMAL(15,2),
    "aliquota" DECIMAL(9,6),
    "valor" DECIMAL(15,2) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "entrada" JSONB NOT NULL,
    "movimentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CalculoDaRetencao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NaturezaDaRetencaoDoIR_codigoReceita_vigenteDesde_key" ON "NaturezaDaRetencaoDoIR"("codigoReceita", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "ServicoDaRetencaoPrevidenciaria_codigo_vigenteDesde_key" ON "ServicoDaRetencaoPrevidenciaria"("codigo", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroDaRetencaoPrevidenciaria_vigenteDesde_key" ON "ParametroDaRetencaoPrevidenciaria"("vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "BaseMinimaDaRetencaoPrevidenciaria_codigo_vigenteDesde_key" ON "BaseMinimaDaRetencaoPrevidenciaria"("codigo", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaListaDoISS_municipioIbge_subitem_vigenteDesde_key" ON "ItemDaListaDoISS"("municipioIbge", "subitem", "vigenteDesde");

-- CreateIndex
CREATE INDEX "PerfilFiscalDoFornecedor_documento_vigenteDesde_idx" ON "PerfilFiscalDoFornecedor"("documento", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "CalculoDaRetencao_movimentoId_key" ON "CalculoDaRetencao"("movimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "CalculoDaRetencao_pagamentoId_tributo_key" ON "CalculoDaRetencao"("pagamentoId", "tributo");

-- AddForeignKey
ALTER TABLE "CalculoDaRetencao" ADD CONSTRAINT "CalculoDaRetencao_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculoDaRetencao" ADD CONSTRAINT "CalculoDaRetencao_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Alíquotas e percentuais são frações entre 0 e 1; valores não negativos.
ALTER TABLE "NaturezaDaRetencaoDoIR" ADD CONSTRAINT "NaturezaDaRetencaoDoIR_aliquota_check" CHECK ("aliquota" >= 0 AND "aliquota" <= 1);
ALTER TABLE "ParametroDaRetencaoPrevidenciaria" ADD CONSTRAINT "ParametroDaRetencaoPrevidenciaria_check" CHECK ("aliquota" > 0 AND "aliquota" <= 1 AND "valorMinimo" >= 0);
ALTER TABLE "BaseMinimaDaRetencaoPrevidenciaria" ADD CONSTRAINT "BaseMinimaDaRetencaoPrevidenciaria_percentual_check" CHECK ("percentual" > 0 AND "percentual" <= 1);
ALTER TABLE "ItemDaListaDoISS" ADD CONSTRAINT "ItemDaListaDoISS_aliquota_check" CHECK ("aliquota" >= 0 AND "aliquota" <= 1);
ALTER TABLE "CalculoDaRetencao" ADD CONSTRAINT "CalculoDaRetencao_valores_check" CHECK ("valor" >= 0 AND ("base" IS NULL OR "base" >= 0) AND ("aliquota" IS NULL OR ("aliquota" >= 0 AND "aliquota" <= 1)));
-- RETIDO tem movimento; NAO_RETIDO tem valor zero e nenhum movimento.
ALTER TABLE "CalculoDaRetencao" ADD CONSTRAINT "CalculoDaRetencao_resultado_check" CHECK (("resultado" = 'RETIDO' AND "valor" > 0 AND "movimentoId" IS NOT NULL) OR ("resultado" = 'NAO_RETIDO' AND "valor" = 0 AND "movimentoId" IS NULL) OR ("resultado" = 'INFORMADO' AND (("valor" > 0) = ("movimentoId" IS NOT NULL))));
