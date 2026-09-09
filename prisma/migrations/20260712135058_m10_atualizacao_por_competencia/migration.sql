-- CreateEnum
CREATE TYPE "MetodoAtualizacao" AS ENUM ('DEPRECIACAO', 'AMORTIZACAO', 'EXAUSTAO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoPatrimonial" ADD VALUE 'AMORTIZACAO';
ALTER TYPE "TipoMovimentoPatrimonial" ADD VALUE 'ESTORNO_AMORTIZACAO';

-- CreateTable
CREATE TABLE "ParametroAtualizacaoClasse" (
    "id" TEXT NOT NULL,
    "classeDeBensId" TEXT NOT NULL,
    "metodo" "MetodoAtualizacao" NOT NULL,
    "vidaUtilMeses" INTEGER NOT NULL,
    "percentualResidual" DECIMAL(9,6) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParametroAtualizacaoClasse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParametroAtualizacaoClasse_classeDeBensId_key" ON "ParametroAtualizacaoClasse"("classeDeBensId");

-- AddForeignKey
ALTER TABLE "ParametroAtualizacaoClasse" ADD CONSTRAINT "ParametroAtualizacaoClasse_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
