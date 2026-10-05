-- V35 — baixa do adiantamento da 1ª parcela do 13º (MCASP 11ª ed., Parte II, 18.1). Aditiva.
CREATE TABLE "BaixaDoAdiantamentoDoDecimoTerceiro" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BaixaDoAdiantamentoDoDecimoTerceiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BaixaDoAdiantamentoDoDecimoTerceiro_exercicio_key" ON "BaixaDoAdiantamentoDoDecimoTerceiro"("exercicio");

CREATE UNIQUE INDEX "BaixaDoAdiantamentoDoDecimoTerceiro_lancamentoId_key" ON "BaixaDoAdiantamentoDoDecimoTerceiro"("lancamentoId");

ALTER TABLE "BaixaDoAdiantamentoDoDecimoTerceiro" ADD CONSTRAINT "BaixaDoAdiantamentoDoDecimoTerceiro_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
