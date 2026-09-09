-- CreateEnum
CREATE TYPE "OrigemDividaAtiva" AS ENUM ('TRIBUTARIA', 'NAO_TRIBUTARIA');

-- CreateEnum
CREATE TYPE "TipoMovimentoDividaAtiva" AS ENUM ('INSCRICAO', 'ATUALIZACAO', 'RECEBIMENTO', 'CANCELAMENTO', 'ESTORNO_INSCRICAO', 'ESTORNO_ATUALIZACAO', 'ESTORNO_RECEBIMENTO', 'ESTORNO_CANCELAMENTO');

-- CreateTable
CREATE TABLE "DividaAtiva" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "devedorNome" TEXT NOT NULL,
    "devedorDocumento" TEXT NOT NULL,
    "origem" "OrigemDividaAtiva" NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DividaAtiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDividaAtiva" (
    "id" TEXT NOT NULL,
    "dividaAtivaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDividaAtiva" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "competencia" TIMESTAMP(3),
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "receitaArrecadadaId" TEXT,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDividaAtiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroDividaAtiva" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoDividaAtiva" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroDividaAtiva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DividaAtiva_identificador_key" ON "DividaAtiva"("identificador");

-- CreateIndex
CREATE INDEX "DividaAtiva_origem_idx" ON "DividaAtiva"("origem");

-- CreateIndex
CREATE INDEX "DividaAtiva_devedorDocumento_idx" ON "DividaAtiva"("devedorDocumento");

-- CreateIndex
CREATE INDEX "MovimentoDividaAtiva_dividaAtivaId_tipo_idx" ON "MovimentoDividaAtiva"("dividaAtivaId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoDividaAtiva_dataMovimento_idx" ON "MovimentoDividaAtiva"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoDividaAtiva_receitaArrecadadaId_idx" ON "MovimentoDividaAtiva"("receitaArrecadadaId");

-- CreateIndex
CREATE INDEX "MovimentoDividaAtiva_estornoDeId_idx" ON "MovimentoDividaAtiva"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroDividaAtiva_tipo_key" ON "RoteiroDividaAtiva"("tipo");

-- AddForeignKey
ALTER TABLE "DividaAtiva" ADD CONSTRAINT "DividaAtiva_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDividaAtiva" ADD CONSTRAINT "MovimentoDividaAtiva_dividaAtivaId_fkey" FOREIGN KEY ("dividaAtivaId") REFERENCES "DividaAtiva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDividaAtiva" ADD CONSTRAINT "MovimentoDividaAtiva_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDividaAtiva" ADD CONSTRAINT "MovimentoDividaAtiva_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDividaAtiva" ADD CONSTRAINT "MovimentoDividaAtiva_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoDividaAtiva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroDividaAtiva" ADD CONSTRAINT "RoteiroDividaAtiva_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroDividaAtiva" ADD CONSTRAINT "RoteiroDividaAtiva_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
