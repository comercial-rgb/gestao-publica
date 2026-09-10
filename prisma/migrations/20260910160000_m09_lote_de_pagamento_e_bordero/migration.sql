-- CreateEnum
CREATE TYPE "TipoMovimentoDoLote" AS ENUM ('FECHADO', 'REABERTO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoDoBordero" AS ENUM ('ENVIADO', 'RETORNO_PROCESSADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "LoteDePagamento" (
    "id" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LoteDePagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoLote" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "ordemId" TEXT,
    "movimentoExtraId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDoLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDoLote" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoLote" NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bordero" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "filaAssinaturaId" TEXT,
    "hashConteudo" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Bordero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDoBordero" (
    "id" TEXT NOT NULL,
    "borderoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoBordero" NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoBordero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaixaDeRetornoBancario" (
    "id" TEXT NOT NULL,
    "borderoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dataLiquidacaoBanco" TIMESTAMP(3) NOT NULL,
    "identificadorBanco" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BaixaDeRetornoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoteDePagamento_contaBancariaId_idx" ON "LoteDePagamento"("contaBancariaId");

-- CreateIndex
CREATE INDEX "LoteDePagamento_dataVencimento_idx" ON "LoteDePagamento"("dataVencimento");

-- CreateIndex
CREATE UNIQUE INDEX "LoteDePagamento_exercicioId_numero_key" ON "LoteDePagamento"("exercicioId", "numero");

-- CreateIndex
CREATE INDEX "ItemDoLote_loteId_idx" ON "ItemDoLote"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoLote_ordemId_key" ON "ItemDoLote"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoLote_movimentoExtraId_key" ON "ItemDoLote"("movimentoExtraId");

-- CreateIndex
CREATE INDEX "MovimentoDoLote_loteId_criadoEm_idx" ON "MovimentoDoLote"("loteId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Bordero_filaAssinaturaId_key" ON "Bordero"("filaAssinaturaId");

-- CreateIndex
CREATE INDEX "Bordero_loteId_idx" ON "Bordero"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "Bordero_loteId_numero_key" ON "Bordero"("loteId", "numero");

-- CreateIndex
CREATE INDEX "MovimentoDoBordero_borderoId_criadoEm_idx" ON "MovimentoDoBordero"("borderoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "BaixaDeRetornoBancario_itemId_key" ON "BaixaDeRetornoBancario"("itemId");

-- CreateIndex
CREATE INDEX "BaixaDeRetornoBancario_borderoId_idx" ON "BaixaDeRetornoBancario"("borderoId");

-- AddForeignKey
ALTER TABLE "LoteDePagamento" ADD CONSTRAINT "LoteDePagamento_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteDePagamento" ADD CONSTRAINT "LoteDePagamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoLote" ADD CONSTRAINT "ItemDoLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoLote" ADD CONSTRAINT "ItemDoLote_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDePagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoLote" ADD CONSTRAINT "ItemDoLote_movimentoExtraId_fkey" FOREIGN KEY ("movimentoExtraId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoLote" ADD CONSTRAINT "MovimentoDoLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bordero" ADD CONSTRAINT "Bordero_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bordero" ADD CONSTRAINT "Bordero_filaAssinaturaId_fkey" FOREIGN KEY ("filaAssinaturaId") REFERENCES "FilaDeAssinatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoBordero" ADD CONSTRAINT "MovimentoDoBordero_borderoId_fkey" FOREIGN KEY ("borderoId") REFERENCES "Bordero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaDeRetornoBancario" ADD CONSTRAINT "BaixaDeRetornoBancario_borderoId_fkey" FOREIGN KEY ("borderoId") REFERENCES "Bordero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaDeRetornoBancario" ADD CONSTRAINT "BaixaDeRetornoBancario_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

