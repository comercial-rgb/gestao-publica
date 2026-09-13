-- V6 P1.2 — a arrecadação declara a conta bancária (nullable: legado); a atribuição do legado é ato próprio.
-- DDL gerada por `prisma migrate diff` sobre o schema local. Aditiva: nada removido.
-- (a primeira tentativa deste arquivo falhou na validação do schema antes de qualquer DDL e foi
--  marcada como rolled-back nos três bancos — nenhum passo havia sido aplicado)

-- AlterTable
ALTER TABLE "ReceitaArrecadada" ADD COLUMN     "contaBancariaId" TEXT;

-- CreateTable
CREATE TABLE "AtribuicaoDeContaDaArrecadacao" (
    "id" TEXT NOT NULL,
    "receitaArrecadadaId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtribuicaoDeContaDaArrecadacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtribuicaoDeContaDaArrecadacao_receitaArrecadadaId_key" ON "AtribuicaoDeContaDaArrecadacao"("receitaArrecadadaId");

-- CreateIndex
CREATE INDEX "AtribuicaoDeContaDaArrecadacao_contaBancariaId_idx" ON "AtribuicaoDeContaDaArrecadacao"("contaBancariaId");

-- CreateIndex
CREATE INDEX "ReceitaArrecadada_contaBancariaId_idx" ON "ReceitaArrecadada"("contaBancariaId");

-- AddForeignKey
ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtribuicaoDeContaDaArrecadacao" ADD CONSTRAINT "AtribuicaoDeContaDaArrecadacao_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtribuicaoDeContaDaArrecadacao" ADD CONSTRAINT "AtribuicaoDeContaDaArrecadacao_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

