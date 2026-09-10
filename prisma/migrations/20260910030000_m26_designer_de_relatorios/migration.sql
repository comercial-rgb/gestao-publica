-- CreateEnum
CREATE TYPE "FonteDeRelatorio" AS ENUM ('PROCESSOS', 'COMUNICADOS');

-- CreateEnum
CREATE TYPE "VisibilidadeDoModelo" AS ENUM ('PUBLICO', 'AUTOR');

-- CreateEnum
CREATE TYPE "TipoDeColunaDoModelo" AS ENUM ('TEXTO', 'NUMERO', 'MOEDA', 'DATA', 'BOOLEANO');

-- CreateEnum
CREATE TYPE "TipoMovimentoDaExecucao" AS ENUM ('CONCLUSAO', 'FALHA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_MODELO_DE_RELATORIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'NOVA_VERSAO_DE_MODELO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'COPIAR_MODELO_DE_RELATORIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DISTRIBUIR_MODELO_DE_RELATORIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RETIRAR_MODELO_DE_RELATORIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'EXECUTAR_RELATORIO';

-- CreateTable
CREATE TABLE "ModeloDeRelatorio" (
    "id" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "fonte" "FonteDeRelatorio" NOT NULL,
    "visibilidade" "VisibilidadeDoModelo" NOT NULL DEFAULT 'AUTOR',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "copiadoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ModeloDeRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColunaDoModelo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "rotulo" TEXT NOT NULL,
    "expressao" TEXT NOT NULL,
    "tipo" "TipoDeColunaDoModelo" NOT NULL DEFAULT 'TEXTO',

    CONSTRAINT "ColunaDoModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetiradaDeModelo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RetiradaDeModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistribuicaoDeModelo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DistribuicaoDeModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoDeRelatorio" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "filtros" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ExecucaoDeRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaExecucao" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaExecucao" NOT NULL,
    "detalhe" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoDaExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoDaExecucao" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "csv" TEXT NOT NULL,
    "linhas" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultadoDaExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeloDeRelatorio_unidadeOrcId_codigo_idx" ON "ModeloDeRelatorio"("unidadeOrcId", "codigo");

-- CreateIndex
CREATE INDEX "ModeloDeRelatorio_criadoPor_idx" ON "ModeloDeRelatorio"("criadoPor");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloDeRelatorio_unidadeOrcId_codigo_versao_key" ON "ModeloDeRelatorio"("unidadeOrcId", "codigo", "versao");

-- CreateIndex
CREATE INDEX "ColunaDoModelo_modeloId_idx" ON "ColunaDoModelo"("modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "ColunaDoModelo_modeloId_ordem_key" ON "ColunaDoModelo"("modeloId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "RetiradaDeModelo_modeloId_key" ON "RetiradaDeModelo"("modeloId");

-- CreateIndex
CREATE INDEX "DistribuicaoDeModelo_unidadeOrcId_idx" ON "DistribuicaoDeModelo"("unidadeOrcId");

-- CreateIndex
CREATE UNIQUE INDEX "DistribuicaoDeModelo_modeloId_unidadeOrcId_key" ON "DistribuicaoDeModelo"("modeloId", "unidadeOrcId");

-- CreateIndex
CREATE INDEX "ExecucaoDeRelatorio_modeloId_idx" ON "ExecucaoDeRelatorio"("modeloId");

-- CreateIndex
CREATE INDEX "ExecucaoDeRelatorio_criadoPor_criadoEm_idx" ON "ExecucaoDeRelatorio"("criadoPor", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoDaExecucao_execucaoId_idx" ON "MovimentoDaExecucao"("execucaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoDaExecucao_execucaoId_key" ON "ResultadoDaExecucao"("execucaoId");

-- AddForeignKey
ALTER TABLE "ModeloDeRelatorio" ADD CONSTRAINT "ModeloDeRelatorio_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeloDeRelatorio" ADD CONSTRAINT "ModeloDeRelatorio_copiadoDeId_fkey" FOREIGN KEY ("copiadoDeId") REFERENCES "ModeloDeRelatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColunaDoModelo" ADD CONSTRAINT "ColunaDoModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiradaDeModelo" ADD CONSTRAINT "RetiradaDeModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribuicaoDeModelo" ADD CONSTRAINT "DistribuicaoDeModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribuicaoDeModelo" ADD CONSTRAINT "DistribuicaoDeModelo_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeRelatorio" ADD CONSTRAINT "ExecucaoDeRelatorio_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeRelatorio" ADD CONSTRAINT "ExecucaoDeRelatorio_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaExecucao" ADD CONSTRAINT "MovimentoDaExecucao_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoDaExecucao" ADD CONSTRAINT "ResultadoDaExecucao_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoDeRelatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

