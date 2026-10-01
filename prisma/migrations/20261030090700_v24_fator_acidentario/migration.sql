-- V24 — o FAP (Decreto 3.048/1999, art. 202-A) no cálculo dos encargos. Aditiva: uma coluna com
-- default (as versões existentes continuam calculando igual) e duas tabelas novas.

ALTER TABLE "VersaoDoEncargo" ADD COLUMN "aplicaFap" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FatorAcidentarioDePrevencao" (
    "id" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "ano" INTEGER NOT NULL,
    "fator" DECIMAL(5,4) NOT NULL,
    "fonte" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "FatorAcidentarioDePrevencao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AprovacaoDoFatorAcidentario" (
    "id" TEXT NOT NULL,
    "fatorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "AprovacaoDoFatorAcidentario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FatorAcidentarioDePrevencao_cnpj_ano_idx" ON "FatorAcidentarioDePrevencao"("cnpj", "ano");
CREATE UNIQUE INDEX "AprovacaoDoFatorAcidentario_fatorId_key" ON "AprovacaoDoFatorAcidentario"("fatorId");
ALTER TABLE "AprovacaoDoFatorAcidentario" ADD CONSTRAINT "AprovacaoDoFatorAcidentario_fatorId_fkey" FOREIGN KEY ("fatorId") REFERENCES "FatorAcidentarioDePrevencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- § 1º do art. 202-A: o FAP é um multiplicador no intervalo contínuo de 0,5 a 2.
ALTER TABLE "FatorAcidentarioDePrevencao" ADD CONSTRAINT "FatorAcidentarioDePrevencao_fator_check" CHECK ("fator" >= 0.5 AND "fator" <= 2);
