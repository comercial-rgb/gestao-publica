-- V35 — ajuste para perdas da dívida ativa (MCASP 11ª ed., Parte III, 5.2.5). Aditiva.
CREATE TABLE "PercentualDePerdaDaDividaAtiva" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "origem" "OrigemDividaAtiva" NOT NULL,
    "percentual" DECIMAL(9,6) NOT NULL,
    "metodologia" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PercentualDePerdaDaDividaAtiva_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApuracaoDoAjusteDePerdas" (
    "id" TEXT NOT NULL,
    "origem" "OrigemDividaAtiva" NOT NULL,
    "dataCorte" TIMESTAMP(3) NOT NULL,
    "saldoDaDividaAtiva" DECIMAL(18,2) NOT NULL,
    "percentualId" TEXT NOT NULL,
    "ajusteEsperado" DECIMAL(18,2) NOT NULL,
    "saldoAnterior" DECIMAL(18,2) NOT NULL,
    "diferenca" DECIMAL(18,2) NOT NULL,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ApuracaoDoAjusteDePerdas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PercentualDePerdaDaDividaAtiva_exercicio_origem_idx" ON "PercentualDePerdaDaDividaAtiva"("exercicio", "origem");

CREATE UNIQUE INDEX "PercentualDePerdaDaDividaAtiva_exercicio_origem_versao_key" ON "PercentualDePerdaDaDividaAtiva"("exercicio", "origem", "versao");

CREATE UNIQUE INDEX "ApuracaoDoAjusteDePerdas_lancamentoId_key" ON "ApuracaoDoAjusteDePerdas"("lancamentoId");

CREATE UNIQUE INDEX "ApuracaoDoAjusteDePerdas_origem_dataCorte_key" ON "ApuracaoDoAjusteDePerdas"("origem", "dataCorte");

ALTER TABLE "ApuracaoDoAjusteDePerdas" ADD CONSTRAINT "ApuracaoDoAjusteDePerdas_percentualId_fkey" FOREIGN KEY ("percentualId") REFERENCES "PercentualDePerdaDaDividaAtiva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApuracaoDoAjusteDePerdas" ADD CONSTRAINT "ApuracaoDoAjusteDePerdas_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
