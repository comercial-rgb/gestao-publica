-- CreateEnum
CREATE TYPE "TipoMovimentoDoChamado" AS ENUM ('RESPOSTA', 'ENCERRAMENTO', 'REABERTURA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'ESCREVER_AJUDA_DE_ROTA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_NIVEL_DE_SEVERIDADE';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ABRIR_CHAMADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RESPONDER_CHAMADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ENCERRAR_CHAMADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REABRIR_CHAMADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RESPONDER_PESQUISA_DE_SATISFACAO';

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "chamadoId" TEXT;

-- CreateTable
CREATE TABLE "AjudaDeRota" (
    "id" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AjudaDeRota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelDeSeveridade" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "prazoHoras" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "NivelDeSeveridade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "severidadeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "rota" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDoChamado" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoChamado" NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoChamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesquisaDeSatisfacao" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PesquisaDeSatisfacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AjudaDeRota_rota_criadoEm_idx" ON "AjudaDeRota"("rota", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "NivelDeSeveridade_codigo_key" ON "NivelDeSeveridade"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_numero_key" ON "Chamado"("numero");

-- CreateIndex
CREATE INDEX "Chamado_unidadeOrcId_criadoEm_idx" ON "Chamado"("unidadeOrcId", "criadoEm");

-- CreateIndex
CREATE INDEX "Chamado_criadoPor_idx" ON "Chamado"("criadoPor");

-- CreateIndex
CREATE INDEX "MovimentoDoChamado_chamadoId_idx" ON "MovimentoDoChamado"("chamadoId");

-- CreateIndex
CREATE INDEX "MovimentoDoChamado_chamadoId_criadoEm_idx" ON "MovimentoDoChamado"("chamadoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "PesquisaDeSatisfacao_chamadoId_key" ON "PesquisaDeSatisfacao"("chamadoId");

-- CreateIndex
CREATE INDEX "Anexo_chamadoId_idx" ON "Anexo"("chamadoId");

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_severidadeId_fkey" FOREIGN KEY ("severidadeId") REFERENCES "NivelDeSeveridade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoChamado" ADD CONSTRAINT "MovimentoDoChamado_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesquisaDeSatisfacao" ADD CONSTRAINT "PesquisaDeSatisfacao_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

