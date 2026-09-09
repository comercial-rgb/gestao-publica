-- CreateEnum
CREATE TYPE "TipoMovimentoDaOrdem" AS ENUM ('AUTORIZACAO', 'CANCELAMENTO');

-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN     "ordemDePagamentoId" TEXT;

-- CreateTable
CREATE TABLE "OrdemDePagamento" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "contaBancaria" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "historico" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "OrdemDePagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaOrdemDePagamento" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaOrdem" NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaOrdemDePagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrdemDePagamento_liquidacaoId_idx" ON "OrdemDePagamento"("liquidacaoId");

-- CreateIndex
CREATE INDEX "OrdemDePagamento_fonteId_idx" ON "OrdemDePagamento"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDePagamento_liquidacaoId_numero_key" ON "OrdemDePagamento"("liquidacaoId", "numero");

-- CreateIndex
CREATE INDEX "MovimentoDaOrdemDePagamento_ordemId_idx" ON "MovimentoDaOrdemDePagamento"("ordemId");

-- CreateIndex
CREATE INDEX "MovimentoDaOrdemDePagamento_ordemId_criadoEm_idx" ON "MovimentoDaOrdemDePagamento"("ordemId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_ordemDePagamentoId_key" ON "Pagamento"("ordemDePagamentoId");

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_ordemDePagamentoId_fkey" FOREIGN KEY ("ordemDePagamentoId") REFERENCES "OrdemDePagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDePagamento" ADD CONSTRAINT "OrdemDePagamento_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDePagamento" ADD CONSTRAINT "OrdemDePagamento_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaOrdemDePagamento" ADD CONSTRAINT "MovimentoDaOrdemDePagamento_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

