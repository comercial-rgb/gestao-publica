-- CreateEnum
CREATE TYPE "PlanoDoRegimeProprio" AS ENUM ('CAPITALIZACAO', 'REPARTICAO');

-- CreateTable
CREATE TABLE "ProjecaoAtuarialDoRreo" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "plano" "PlanoDoRegimeProprio" NOT NULL,
    "versao" INTEGER NOT NULL,
    "dataDaAvaliacao" TIMESTAMP(3) NOT NULL,
    "documento" TEXT NOT NULL,
    "saldoFinanceiroAnterior" DECIMAL(18,2) NOT NULL,
    "retirada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProjecaoAtuarialDoRreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaDaProjecaoAtuarialDoRreo" (
    "id" TEXT NOT NULL,
    "projecaoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "receitas" DECIMAL(18,2) NOT NULL,
    "despesas" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LinhaDaProjecaoAtuarialDoRreo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjecaoAtuarialDoRreo_exercicio_plano_idx" ON "ProjecaoAtuarialDoRreo"("exercicio", "plano");

-- CreateIndex
CREATE UNIQUE INDEX "ProjecaoAtuarialDoRreo_exercicio_plano_versao_key" ON "ProjecaoAtuarialDoRreo"("exercicio", "plano", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaDaProjecaoAtuarialDoRreo_projecaoId_ano_key" ON "LinhaDaProjecaoAtuarialDoRreo"("projecaoId", "ano");

-- AddForeignKey
ALTER TABLE "LinhaDaProjecaoAtuarialDoRreo" ADD CONSTRAINT "LinhaDaProjecaoAtuarialDoRreo_projecaoId_fkey" FOREIGN KEY ("projecaoId") REFERENCES "ProjecaoAtuarialDoRreo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

