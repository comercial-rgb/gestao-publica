-- CreateTable
CREATE TABLE "MigracaoDeConta" (
    "id" TEXT NOT NULL,
    "contaOrigemId" TEXT NOT NULL,
    "contaDestinoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "saldoMigrado" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MigracaoDeConta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MigracaoDeConta_contaOrigemId_idx" ON "MigracaoDeConta"("contaOrigemId");

-- CreateIndex
CREATE INDEX "MigracaoDeConta_contaDestinoId_idx" ON "MigracaoDeConta"("contaDestinoId");

-- CreateIndex
CREATE INDEX "MigracaoDeConta_data_idx" ON "MigracaoDeConta"("data");

-- AddForeignKey
ALTER TABLE "MigracaoDeConta" ADD CONSTRAINT "MigracaoDeConta_contaOrigemId_fkey" FOREIGN KEY ("contaOrigemId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigracaoDeConta" ADD CONSTRAINT "MigracaoDeConta_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigracaoDeConta" ADD CONSTRAINT "MigracaoDeConta_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
