-- V36 — EMENDAS ao projeto da LOA (TR 5.9.3.13 a 5.9.3.15). Aditiva: tabelas novas, sem backfill.
-- CreateEnum
CREATE TYPE "ResultadoDaSancao" AS ENUM ('APROVADA', 'REJEITADA', 'PARCIAL');

-- CreateTable
CREATE TABLE "EmendaAoOrcamento" (
    "id" TEXT NOT NULL,
    "propostaOrcamentariaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "objetivo" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "vereador" TEXT NOT NULL,
    "textoJuridico" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EmendaAoOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaEmenda" (
    "id" TEXT NOT NULL,
    "emendaId" TEXT NOT NULL,
    "linhaDeDespesaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemDaEmenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SancaoDaEmenda" (
    "id" TEXT NOT NULL,
    "emendaId" TEXT NOT NULL,
    "resultado" "ResultadoDaSancao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "ato" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SancaoDaEmenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemSancionado" (
    "id" TEXT NOT NULL,
    "sancaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ajusteId" TEXT NOT NULL,

    CONSTRAINT "ItemSancionado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioDeEmenda" (
    "id" TEXT NOT NULL,
    "linhaDeDespesaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "revogaDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BloqueioDeEmenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmendaAoOrcamento_propostaOrcamentariaId_idx" ON "EmendaAoOrcamento"("propostaOrcamentariaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmendaAoOrcamento_propostaOrcamentariaId_numero_key" ON "EmendaAoOrcamento"("propostaOrcamentariaId", "numero");

-- CreateIndex
CREATE INDEX "ItemDaEmenda_linhaDeDespesaId_idx" ON "ItemDaEmenda"("linhaDeDespesaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaEmenda_emendaId_linhaDeDespesaId_key" ON "ItemDaEmenda"("emendaId", "linhaDeDespesaId");

-- CreateIndex
CREATE UNIQUE INDEX "SancaoDaEmenda_emendaId_key" ON "SancaoDaEmenda"("emendaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSancionado_ajusteId_key" ON "ItemSancionado"("ajusteId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSancionado_sancaoId_itemId_key" ON "ItemSancionado"("sancaoId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BloqueioDeEmenda_revogaDeId_key" ON "BloqueioDeEmenda"("revogaDeId");

-- CreateIndex
CREATE INDEX "BloqueioDeEmenda_linhaDeDespesaId_idx" ON "BloqueioDeEmenda"("linhaDeDespesaId");

-- AddForeignKey
ALTER TABLE "EmendaAoOrcamento" ADD CONSTRAINT "EmendaAoOrcamento_propostaOrcamentariaId_fkey" FOREIGN KEY ("propostaOrcamentariaId") REFERENCES "PropostaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmenda" ADD CONSTRAINT "ItemDaEmenda_emendaId_fkey" FOREIGN KEY ("emendaId") REFERENCES "EmendaAoOrcamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmenda" ADD CONSTRAINT "ItemDaEmenda_linhaDeDespesaId_fkey" FOREIGN KEY ("linhaDeDespesaId") REFERENCES "LinhaDeDespesaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SancaoDaEmenda" ADD CONSTRAINT "SancaoDaEmenda_emendaId_fkey" FOREIGN KEY ("emendaId") REFERENCES "EmendaAoOrcamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionado" ADD CONSTRAINT "ItemSancionado_sancaoId_fkey" FOREIGN KEY ("sancaoId") REFERENCES "SancaoDaEmenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionado" ADD CONSTRAINT "ItemSancionado_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDaEmenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionado" ADD CONSTRAINT "ItemSancionado_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "AjusteDeDespesaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmenda" ADD CONSTRAINT "BloqueioDeEmenda_linhaDeDespesaId_fkey" FOREIGN KEY ("linhaDeDespesaId") REFERENCES "LinhaDeDespesaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmenda" ADD CONSTRAINT "BloqueioDeEmenda_revogaDeId_fkey" FOREIGN KEY ("revogaDeId") REFERENCES "BloqueioDeEmenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

