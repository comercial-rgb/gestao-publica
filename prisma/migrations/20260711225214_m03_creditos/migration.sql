-- CreateEnum
CREATE TYPE "TipoCredito" AS ENUM ('SUPLEMENTAR', 'ESPECIAL', 'EXTRAORDINARIO');

-- CreateEnum
CREATE TYPE "OrigemRecurso" AS ENUM ('ANULACAO', 'SUPERAVIT_FINANCEIRO', 'EXCESSO_ARRECADACAO', 'OPERACAO_CREDITO');

-- CreateEnum
CREATE TYPE "TipoItemCredito" AS ENUM ('SUPLEMENTACAO', 'ANULACAO');

-- CreateTable
CREATE TABLE "LeiCredito" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipoCredito" "TipoCredito" NOT NULL,
    "valorAutorizado" DECIMAL(18,2) NOT NULL,
    "percentualLimite" DECIMAL(9,6),
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LeiCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecretoCredito" (
    "id" TEXT NOT NULL,
    "leiId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "origemRecurso" "OrigemRecurso" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DecretoCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecretoEncerramento" (
    "id" TEXT NOT NULL,
    "decretoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DecretoEncerramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCredito" (
    "id" TEXT NOT NULL,
    "decretoId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "tipo" "TipoItemCredito" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "fonteId" TEXT NOT NULL,
    "movimentoDotacaoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisponibilidadeRecursoNovo" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fonteId" TEXT NOT NULL,
    "origem" "OrigemRecurso" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DisponibilidadeRecursoNovo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeiCredito_ano_idx" ON "LeiCredito"("ano");

-- CreateIndex
CREATE UNIQUE INDEX "LeiCredito_ano_numero_key" ON "LeiCredito"("ano", "numero");

-- CreateIndex
CREATE INDEX "DecretoCredito_leiId_idx" ON "DecretoCredito"("leiId");

-- CreateIndex
CREATE UNIQUE INDEX "DecretoCredito_ano_numero_key" ON "DecretoCredito"("ano", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "DecretoEncerramento_decretoId_key" ON "DecretoEncerramento"("decretoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCredito_movimentoDotacaoId_key" ON "ItemCredito"("movimentoDotacaoId");

-- CreateIndex
CREATE INDEX "ItemCredito_decretoId_idx" ON "ItemCredito"("decretoId");

-- CreateIndex
CREATE INDEX "ItemCredito_fichaId_idx" ON "ItemCredito"("fichaId");

-- CreateIndex
CREATE INDEX "ItemCredito_estornoDeId_idx" ON "ItemCredito"("estornoDeId");

-- CreateIndex
CREATE INDEX "DisponibilidadeRecursoNovo_fonteId_idx" ON "DisponibilidadeRecursoNovo"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "DisponibilidadeRecursoNovo_exercicio_fonteId_origem_key" ON "DisponibilidadeRecursoNovo"("exercicio", "fonteId", "origem");

-- AddForeignKey
ALTER TABLE "DecretoCredito" ADD CONSTRAINT "DecretoCredito_leiId_fkey" FOREIGN KEY ("leiId") REFERENCES "LeiCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecretoEncerramento" ADD CONSTRAINT "DecretoEncerramento_decretoId_fkey" FOREIGN KEY ("decretoId") REFERENCES "DecretoCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCredito" ADD CONSTRAINT "ItemCredito_decretoId_fkey" FOREIGN KEY ("decretoId") REFERENCES "DecretoCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCredito" ADD CONSTRAINT "ItemCredito_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCredito" ADD CONSTRAINT "ItemCredito_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCredito" ADD CONSTRAINT "ItemCredito_movimentoDotacaoId_fkey" FOREIGN KEY ("movimentoDotacaoId") REFERENCES "MovimentoDotacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCredito" ADD CONSTRAINT "ItemCredito_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "ItemCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisponibilidadeRecursoNovo" ADD CONSTRAINT "DisponibilidadeRecursoNovo_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
