-- CreateEnum
CREATE TYPE "TipoDeAjusteDosEncargos" AS ENUM ('ANULACAO_DE_LIQUIDACAO', 'ANULACAO_DE_EMPENHO', 'RESTITUICAO_A_PROVIDENCIAR');

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "guiaDeRecolhimentoId" TEXT;

-- CreateTable
CREATE TABLE "AjusteDosEncargos" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "tipo" "TipoDeAjusteDosEncargos" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "anulacaoDeEmpenhoId" TEXT,
    "anulacaoDeLiquidacaoId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AjusteDosEncargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaDeRecolhimento" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3),
    "fundamentoDoVencimento" TEXT,
    "principal" DECIMAL(18,2) NOT NULL,
    "componentes" JSONB NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "GuiaDeRecolhimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaixaDaGuia" (
    "id" TEXT NOT NULL,
    "guiaId" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "observacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BaixaDaGuia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDaGuia" (
    "id" TEXT NOT NULL,
    "guiaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CancelamentoDaGuia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDosEncargos_chave_key" ON "AjusteDosEncargos"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDosEncargos_anulacaoDeEmpenhoId_key" ON "AjusteDosEncargos"("anulacaoDeEmpenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDosEncargos_anulacaoDeLiquidacaoId_key" ON "AjusteDosEncargos"("anulacaoDeLiquidacaoId");

-- CreateIndex
CREATE INDEX "AjusteDosEncargos_apuracaoId_idx" ON "AjusteDosEncargos"("apuracaoId");

-- CreateIndex
CREATE INDEX "AjusteDosEncargos_grupoId_idx" ON "AjusteDosEncargos"("grupoId");

-- CreateIndex
CREATE INDEX "GuiaDeRecolhimento_folhaId_idx" ON "GuiaDeRecolhimento"("folhaId");

-- CreateIndex
CREATE INDEX "GuiaDeRecolhimento_grupoId_idx" ON "GuiaDeRecolhimento"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "GuiaDeRecolhimento_destinatarioId_identificador_key" ON "GuiaDeRecolhimento"("destinatarioId", "identificador");

-- CreateIndex
CREATE UNIQUE INDEX "BaixaDaGuia_guiaId_key" ON "BaixaDaGuia"("guiaId");

-- CreateIndex
CREATE UNIQUE INDEX "BaixaDaGuia_pagamentoId_key" ON "BaixaDaGuia"("pagamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDaGuia_guiaId_key" ON "CancelamentoDaGuia"("guiaId");

-- CreateIndex
CREATE INDEX "Anexo_guiaDeRecolhimentoId_idx" ON "Anexo"("guiaDeRecolhimentoId");

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_guiaDeRecolhimentoId_fkey" FOREIGN KEY ("guiaDeRecolhimentoId") REFERENCES "GuiaDeRecolhimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "AjusteDosEncargos_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ApuracaoDeEncargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "AjusteDosEncargos_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaDeRecolhimento" ADD CONSTRAINT "GuiaDeRecolhimento_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaDeRecolhimento" ADD CONSTRAINT "GuiaDeRecolhimento_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaDeRecolhimento" ADD CONSTRAINT "GuiaDeRecolhimento_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaDaGuia" ADD CONSTRAINT "BaixaDaGuia_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "GuiaDeRecolhimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaDaGuia" ADD CONSTRAINT "BaixaDaGuia_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDaGuia" ADD CONSTRAINT "CancelamentoDaGuia_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "GuiaDeRecolhimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- V7 M1 U3 — invariantes que o Prisma não expressa.
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "ck_ajuste_dos_encargos_valor" CHECK ("valor" > 0);
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "ck_ajuste_dos_encargos_documento" CHECK (
  ("tipo" = 'ANULACAO_DE_EMPENHO' AND "anulacaoDeEmpenhoId" IS NOT NULL AND "anulacaoDeLiquidacaoId" IS NULL) OR
  ("tipo" = 'ANULACAO_DE_LIQUIDACAO' AND "anulacaoDeLiquidacaoId" IS NOT NULL AND "anulacaoDeEmpenhoId" IS NULL) OR
  ("tipo" = 'RESTITUICAO_A_PROVIDENCIAR' AND "anulacaoDeEmpenhoId" IS NULL AND "anulacaoDeLiquidacaoId" IS NULL)
);
ALTER TABLE "GuiaDeRecolhimento" ADD CONSTRAINT "ck_guia_vencimento_com_fundamento" CHECK (("vencimento" IS NULL) = ("fundamentoDoVencimento" IS NULL));
ALTER TABLE "GuiaDeRecolhimento" ADD CONSTRAINT "ck_guia_valores" CHECK ("principal" > 0 AND "total" >= "principal");
