-- V39-R2 (R2-001/002, M09) — A FOTO DO ENCERRAMENTO DA CONCILIAÇÃO: a composição conferida (saldos, diferença e cada
-- pendência), gravada na mesma transação do encerramento. Aditiva: uma tabela nova, uma por conciliação.
-- CreateTable
CREATE TABLE "FotoDoEncerramentoDaConciliacao" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "saldoExtrato" DECIMAL(18,2) NOT NULL,
    "saldoContabil" DECIMAL(18,2) NOT NULL,
    "diferenca" DECIMAL(18,2) NOT NULL,
    "pendencias" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FotoDoEncerramentoDaConciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FotoDoEncerramentoDaConciliacao_conciliacaoId_key" ON "FotoDoEncerramentoDaConciliacao"("conciliacaoId");

-- AddForeignKey
ALTER TABLE "FotoDoEncerramentoDaConciliacao" ADD CONSTRAINT "FotoDoEncerramentoDaConciliacao_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
