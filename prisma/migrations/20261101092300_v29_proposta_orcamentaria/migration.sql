-- V29 — a proposta orçamentária do exercício seguinte (M02). Aditiva: dois enums e seis tabelas
-- insert-only. Ver prisma/schema/m02-proposta-orcamentaria.prisma.

-- CreateEnum
CREATE TYPE "BaseDaDespesaDaProposta" AS ENUM ('DOTACAO_INICIAL', 'DOTACAO_AUTORIZADA', 'EMPENHADO', 'SEM_VALOR');

-- CreateEnum
CREATE TYPE "BaseDaReceitaDaProposta" AS ENUM ('PREVISAO_INICIAL', 'PREVISAO_ATUALIZADA', 'SEM_VALOR');

-- CreateTable
CREATE TABLE "PropostaOrcamentaria" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "exercicioDeOrigem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "baseDaReceita" "BaseDaReceitaDaProposta" NOT NULL,
    "percentualDaReceita" DECIMAL(9,6) NOT NULL,
    "baseDaDespesa" "BaseDaDespesaDaProposta" NOT NULL,
    "percentualDaDespesa" DECIMAL(9,6) NOT NULL,
    "aproveitaReceitas" BOOLEAN NOT NULL,
    "aproveitaFichas" BOOLEAN NOT NULL,
    "reajustaProjetos" BOOLEAN NOT NULL,
    "incluiFichasAbertasPorCredito" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PropostaOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaDeReceitaDaProposta" (
    "id" TEXT NOT NULL,
    "propostaOrcamentariaId" TEXT NOT NULL,
    "receitaDeOrigemId" TEXT NOT NULL,
    "valorNaLeiDeOrigem" DECIMAL(18,2) NOT NULL,
    "valorBase" DECIMAL(18,2) NOT NULL,
    "valorProjetado" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LinhaDeReceitaDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteDeReceitaDaProposta" (
    "id" TEXT NOT NULL,
    "linhaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AjusteDeReceitaDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaDeDespesaDaProposta" (
    "id" TEXT NOT NULL,
    "propostaOrcamentariaId" TEXT NOT NULL,
    "fichaDeOrigemId" TEXT NOT NULL,
    "valorNaLeiDeOrigem" DECIMAL(18,2) NOT NULL,
    "valorBase" DECIMAL(18,2) NOT NULL,
    "valorProjetado" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LinhaDeDespesaDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteDeDespesaDaProposta" (
    "id" TEXT NOT NULL,
    "linhaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AjusteDeDespesaDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EfetivacaoDaProposta" (
    "id" TEXT NOT NULL,
    "propostaOrcamentariaId" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fichasCriadas" INTEGER NOT NULL,
    "receitasCriadas" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EfetivacaoDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropostaOrcamentaria_exercicio_idx" ON "PropostaOrcamentaria"("exercicio");

-- CreateIndex
CREATE INDEX "LinhaDeReceitaDaProposta_propostaOrcamentariaId_idx" ON "LinhaDeReceitaDaProposta"("propostaOrcamentariaId");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaDeReceitaDaProposta_propostaOrcamentariaId_receitaDeOr_key" ON "LinhaDeReceitaDaProposta"("propostaOrcamentariaId", "receitaDeOrigemId");

-- CreateIndex
CREATE INDEX "AjusteDeReceitaDaProposta_linhaId_criadoEm_idx" ON "AjusteDeReceitaDaProposta"("linhaId", "criadoEm");

-- CreateIndex
CREATE INDEX "LinhaDeDespesaDaProposta_propostaOrcamentariaId_idx" ON "LinhaDeDespesaDaProposta"("propostaOrcamentariaId");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaDeDespesaDaProposta_propostaOrcamentariaId_fichaDeOrig_key" ON "LinhaDeDespesaDaProposta"("propostaOrcamentariaId", "fichaDeOrigemId");

-- CreateIndex
CREATE INDEX "AjusteDeDespesaDaProposta_linhaId_criadoEm_idx" ON "AjusteDeDespesaDaProposta"("linhaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "EfetivacaoDaProposta_propostaOrcamentariaId_key" ON "EfetivacaoDaProposta"("propostaOrcamentariaId");

-- CreateIndex
CREATE UNIQUE INDEX "EfetivacaoDaProposta_exercicio_key" ON "EfetivacaoDaProposta"("exercicio");

-- AddForeignKey
ALTER TABLE "LinhaDeReceitaDaProposta" ADD CONSTRAINT "LinhaDeReceitaDaProposta_propostaOrcamentariaId_fkey" FOREIGN KEY ("propostaOrcamentariaId") REFERENCES "PropostaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeReceitaDaProposta" ADD CONSTRAINT "LinhaDeReceitaDaProposta_receitaDeOrigemId_fkey" FOREIGN KEY ("receitaDeOrigemId") REFERENCES "ReceitaPrevista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDeReceitaDaProposta" ADD CONSTRAINT "AjusteDeReceitaDaProposta_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaDeReceitaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeDespesaDaProposta" ADD CONSTRAINT "LinhaDeDespesaDaProposta_propostaOrcamentariaId_fkey" FOREIGN KEY ("propostaOrcamentariaId") REFERENCES "PropostaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeDespesaDaProposta" ADD CONSTRAINT "LinhaDeDespesaDaProposta_fichaDeOrigemId_fkey" FOREIGN KEY ("fichaDeOrigemId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDeDespesaDaProposta" ADD CONSTRAINT "AjusteDeDespesaDaProposta_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaDeDespesaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EfetivacaoDaProposta" ADD CONSTRAINT "EfetivacaoDaProposta_propostaOrcamentariaId_fkey" FOREIGN KEY ("propostaOrcamentariaId") REFERENCES "PropostaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
