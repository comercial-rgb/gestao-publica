-- CreateTable
CREATE TABLE "RoteiroOrcamentario" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoDotacao" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroOrcamentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroOrcamentario_tipo_key" ON "RoteiroOrcamentario"("tipo");

-- AddForeignKey
ALTER TABLE "RoteiroOrcamentario" ADD CONSTRAINT "RoteiroOrcamentario_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroOrcamentario" ADD CONSTRAINT "RoteiroOrcamentario_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
