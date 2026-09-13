-- AlterEnum
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DEFINIR_PARAMETRO_DE_ATUALIZACAO';

-- CreateTable
CREATE TABLE "VersaoDeParametroDeAtualizacao" (
    "id" TEXT NOT NULL,
    "classeDeBensId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "metodo" "MetodoAtualizacao" NOT NULL,
    "vidaUtilMeses" INTEGER NOT NULL,
    "percentualResidual" DECIMAL(9,6) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDeParametroDeAtualizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoriaDeAtualizacao" (
    "id" TEXT NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "versaoDeParametroId" TEXT,
    "metodo" "MetodoAtualizacao" NOT NULL,
    "vidaUtilMeses" INTEGER NOT NULL,
    "percentualResidual" DECIMAL(9,6) NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "valorContabilAntes" DECIMAL(18,2) NOT NULL,
    "valorResidual" DECIMAL(18,2) NOT NULL,
    "parcelaCheia" DECIMAL(18,2) NOT NULL,
    "teto" DECIMAL(18,2) NOT NULL,
    "valorDaParcela" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoriaDeAtualizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDeParametroDeAtualizacao_classeDeBensId_numero_key" ON "VersaoDeParametroDeAtualizacao"("classeDeBensId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "MemoriaDeAtualizacao_movimentoId_key" ON "MemoriaDeAtualizacao"("movimentoId");

-- CreateIndex
CREATE INDEX "MemoriaDeAtualizacao_versaoDeParametroId_idx" ON "MemoriaDeAtualizacao"("versaoDeParametroId");

-- AddForeignKey
ALTER TABLE "VersaoDeParametroDeAtualizacao" ADD CONSTRAINT "VersaoDeParametroDeAtualizacao_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoriaDeAtualizacao" ADD CONSTRAINT "MemoriaDeAtualizacao_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoriaDeAtualizacao" ADD CONSTRAINT "MemoriaDeAtualizacao_versaoDeParametroId_fkey" FOREIGN KEY ("versaoDeParametroId") REFERENCES "VersaoDeParametroDeAtualizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
