-- V22 — A SOLICITAÇÃO DE EMPENHO (M05): pedir, autorizar, e só então emitir.
--
-- ADITIVA: duas tabelas novas, um enum novo e UMA coluna nullable no Empenho. Zero DROP.
--
-- ⚠️ SEM COLUNA DE STATUS. A situação da solicitação é DERIVADA do último movimento (e a
-- existência de um empenho emitido dela vence tudo) — `situacaoDaSolicitacao` no M05.
--
-- ⚠️ `Empenho.solicitacaoDeEmpenhoId` é ÚNICO: a solicitação autoriza UM ato, e a unicidade é
-- a garantia dura contra duas emissões da mesma autorização (a trava e a situação derivada
-- são a primeira linha, dentro da transação do empenho). A anulação NÃO copia a coluna.
--
-- ⚠️ As ações novas (SOLICITAR_EMPENHO, AUTORIZAR_SOLICITACAO_DE_EMPENHO) ficam na migration
-- SEGUINTE, sozinhas: `ALTER TYPE ... ADD VALUE` fica em migration própria desde a V15.

-- CreateEnum
CREATE TYPE "TipoMovimentoDaSolicitacaoDeEmpenho" AS ENUM ('AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN "solicitacaoDeEmpenhoId" TEXT;

-- CreateTable
CREATE TABLE "SolicitacaoDeEmpenho" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "credorCpfCnpj" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "tipo" "TipoEmpenho" NOT NULL,
    "categoriaOrdemCronologica" "CategoriaOrdemCronologica",
    "historico" TEXT NOT NULL,
    "contratoId" TEXT,
    "ordemDeCompraId" TEXT,
    "convenioId" TEXT,
    "obraId" TEXT,
    "dividaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SolicitacaoDeEmpenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaSolicitacaoDeEmpenho" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaSolicitacaoDeEmpenho" NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaSolicitacaoDeEmpenho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitacaoDeEmpenho_fichaId_idx" ON "SolicitacaoDeEmpenho"("fichaId");

-- CreateIndex
CREATE INDEX "SolicitacaoDeEmpenho_criadoEm_idx" ON "SolicitacaoDeEmpenho"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoDeEmpenho_fichaId_numero_key" ON "SolicitacaoDeEmpenho"("fichaId", "numero");

-- CreateIndex
CREATE INDEX "MovimentoDaSolicitacaoDeEmpenho_solicitacaoId_criadoEm_idx" ON "MovimentoDaSolicitacaoDeEmpenho"("solicitacaoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Empenho_solicitacaoDeEmpenhoId_key" ON "Empenho"("solicitacaoDeEmpenhoId");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_solicitacaoDeEmpenhoId_fkey" FOREIGN KEY ("solicitacaoDeEmpenhoId") REFERENCES "SolicitacaoDeEmpenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_ordemDeCompraId_fkey" FOREIGN KEY ("ordemDeCompraId") REFERENCES "OrdemDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeEmpenho" ADD CONSTRAINT "SolicitacaoDeEmpenho_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "DividaConsolidada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaSolicitacaoDeEmpenho" ADD CONSTRAINT "MovimentoDaSolicitacaoDeEmpenho_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeEmpenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
