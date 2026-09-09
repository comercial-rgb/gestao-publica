-- CreateEnum
CREATE TYPE "NaturezaLancamento" AS ENUM ('NORMAL', 'ENCERRAMENTO');

-- AlterTable
ALTER TABLE "LancamentoContabil" ADD COLUMN     "natureza" "NaturezaLancamento";

-- CreateTable
CREATE TABLE "RoteiroEncerramento" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL DEFAULT 'PADRAO',
    "contaResultadosAcumuladosId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroEncerramento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroEncerramento_chave_key" ON "RoteiroEncerramento"("chave");

-- AddForeignKey
ALTER TABLE "RoteiroEncerramento" ADD CONSTRAINT "RoteiroEncerramento_contaResultadosAcumuladosId_fkey" FOREIGN KEY ("contaResultadosAcumuladosId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
