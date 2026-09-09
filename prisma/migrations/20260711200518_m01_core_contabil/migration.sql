-- CreateEnum
CREATE TYPE "FonteIntegracao" AS ENUM ('BANCO_DO_BRASIL', 'TCE_PB', 'EFD_REINF', 'ESOCIAL', 'TRIBUTARIO', 'FOLHA');

-- CreateEnum
CREATE TYPE "StatusInbox" AS ENUM ('RECEBIDO', 'PROCESSADO', 'ERRO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "StatusOutbox" AS ENUM ('PENDENTE', 'ASSINADO', 'TRANSMITIDO', 'ACEITO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "NaturezaSaldo" AS ENUM ('DEVEDORA', 'CREDORA');

-- CreateEnum
CREATE TYPE "IndicadorSuperavit" AS ENUM ('F', 'P');

-- CreateEnum
CREATE TYPE "TipoPartida" AS ENUM ('DEBITO', 'CREDITO');

-- CreateEnum
CREATE TYPE "Subsistema" AS ENUM ('ORCAMENTARIO', 'PATRIMONIAL', 'CONTROLE');

-- CreateTable
CREATE TABLE "IntegracaoInbox" (
    "id" TEXT NOT NULL,
    "fonte" "FonteIntegracao" NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "chaveIdemp" TEXT NOT NULL,
    "payloadRaw" JSONB NOT NULL,
    "status" "StatusInbox" NOT NULL DEFAULT 'RECEBIDO',
    "erro" TEXT,
    "processadoEm" TIMESTAMP(3),
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoFiscalOutbox" (
    "id" TEXT NOT NULL,
    "destino" "FonteIntegracao" NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "chaveIdemp" TEXT NOT NULL,
    "payloadRaw" JSONB NOT NULL,
    "status" "StatusOutbox" NOT NULL DEFAULT 'PENDENTE',
    "protocolo" TEXT,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoFiscalOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPcasp" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "naturezaSaldo" "NaturezaSaldo" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "contaPaiId" TEXT,
    "analitica" BOOLEAN NOT NULL,
    "indicadorSuperavit" "IndicadorSuperavit",

    CONSTRAINT "ContaPcasp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoContabil" (
    "id" TEXT NOT NULL,
    "numeroControle" TEXT NOT NULL,
    "dataTransacao" TIMESTAMP(3) NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "historico" TEXT NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "origemId" TEXT,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LancamentoContabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartidaContabil" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "tipo" "TipoPartida" NOT NULL,
    "subsistema" "Subsistema" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PartidaContabil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegracaoInbox_fonte_status_idx" ON "IntegracaoInbox"("fonte", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoInbox_fonte_chaveIdemp_key" ON "IntegracaoInbox"("fonte", "chaveIdemp");

-- CreateIndex
CREATE UNIQUE INDEX "EventoFiscalOutbox_destino_chaveIdemp_key" ON "EventoFiscalOutbox"("destino", "chaveIdemp");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPcasp_codigo_key" ON "ContaPcasp"("codigo");

-- CreateIndex
CREATE INDEX "ContaPcasp_contaPaiId_idx" ON "ContaPcasp"("contaPaiId");

-- CreateIndex
CREATE INDEX "ContaPcasp_analitica_idx" ON "ContaPcasp"("analitica");

-- CreateIndex
CREATE INDEX "LancamentoContabil_numeroControle_idx" ON "LancamentoContabil"("numeroControle");

-- CreateIndex
CREATE INDEX "LancamentoContabil_competencia_idx" ON "LancamentoContabil"("competencia");

-- CreateIndex
CREATE INDEX "LancamentoContabil_dataTransacao_idx" ON "LancamentoContabil"("dataTransacao");

-- CreateIndex
CREATE INDEX "LancamentoContabil_origemTipo_origemId_idx" ON "LancamentoContabil"("origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "LancamentoContabil_estornoDeId_idx" ON "LancamentoContabil"("estornoDeId");

-- CreateIndex
CREATE INDEX "PartidaContabil_lancamentoId_idx" ON "PartidaContabil"("lancamentoId");

-- CreateIndex
CREATE INDEX "PartidaContabil_contaId_idx" ON "PartidaContabil"("contaId");

-- CreateIndex
CREATE INDEX "PartidaContabil_contaId_subsistema_idx" ON "PartidaContabil"("contaId", "subsistema");

-- AddForeignKey
ALTER TABLE "ContaPcasp" ADD CONSTRAINT "ContaPcasp_contaPaiId_fkey" FOREIGN KEY ("contaPaiId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoContabil" ADD CONSTRAINT "LancamentoContabil_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaContabil" ADD CONSTRAINT "PartidaContabil_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaContabil" ADD CONSTRAINT "PartidaContabil_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
