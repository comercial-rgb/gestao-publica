-- V35 — a dedução da receita realizada (FUNDEB), com a natureza da receita deduzida (MCASP). Aditiva: um enum, uma
-- tabela, três índices e cinco FKs. Nada é removido.

-- CreateEnum
CREATE TYPE "TipoDeducaoDaReceita" AS ENUM ('FUNDEB');

-- CreateTable
CREATE TABLE "DeducaoDaReceitaRealizada" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "exercicioFonte" INTEGER NOT NULL DEFAULT 1,
    "tipo" "TipoDeducaoDaReceita" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "documento" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeducaoDaReceitaRealizada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeducaoDaReceitaRealizada_lancamentoId_key" ON "DeducaoDaReceitaRealizada"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "DeducaoDaReceitaRealizada_estornoDeId_key" ON "DeducaoDaReceitaRealizada"("estornoDeId");

-- CreateIndex
CREATE INDEX "DeducaoDaReceitaRealizada_exercicio_naturezaReceitaId_idx" ON "DeducaoDaReceitaRealizada"("exercicio", "naturezaReceitaId");

-- AddForeignKey
ALTER TABLE "DeducaoDaReceitaRealizada" ADD CONSTRAINT "DeducaoDaReceitaRealizada_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeducaoDaReceitaRealizada" ADD CONSTRAINT "DeducaoDaReceitaRealizada_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeducaoDaReceitaRealizada" ADD CONSTRAINT "DeducaoDaReceitaRealizada_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeducaoDaReceitaRealizada" ADD CONSTRAINT "DeducaoDaReceitaRealizada_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeducaoDaReceitaRealizada" ADD CONSTRAINT "DeducaoDaReceitaRealizada_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "DeducaoDaReceitaRealizada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
