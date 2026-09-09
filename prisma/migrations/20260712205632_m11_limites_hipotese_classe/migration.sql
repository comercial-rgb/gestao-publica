-- CreateEnum
CREATE TYPE "HipoteseDispensa" AS ENUM ('POR_VALOR_OBRAS', 'POR_VALOR_COMPRAS', 'OUTRAS');

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "classeDeBensId" TEXT;

-- AlterTable
ALTER TABLE "ProcessoLicitatorio" ADD COLUMN     "hipoteseDispensa" "HipoteseDispensa";

-- CreateTable
CREATE TABLE "LimiteContratacao" (
    "id" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "fonteLegal" TEXT NOT NULL,
    "limiteObrasEngenharia" DECIMAL(18,2) NOT NULL,
    "limiteComprasServicos" DECIMAL(18,2) NOT NULL,
    "limiteControleInternoObras" DECIMAL(18,2),
    "limiteControleInternoCompras" DECIMAL(18,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LimiteContratacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LimiteContratacao_vigenciaInicio_idx" ON "LimiteContratacao"("vigenciaInicio");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
