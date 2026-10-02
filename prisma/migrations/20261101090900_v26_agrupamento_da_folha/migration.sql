-- V26 (ordem, item 2.2) — o código de agrupamento da folha (do sistema da folha) em cada liquidação, um para um. Aditiva.

-- CreateEnum
CREATE TYPE "OrigemDoAgrupamentoDaFolha" AS ENUM ('FOLHA_DESTE_SISTEMA', 'FOLHA_DE_OUTRO_SISTEMA');

-- CreateTable
CREATE TABLE "AgrupamentoDaFolhaNaLiquidacao" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "ugId" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "origem" "OrigemDoAgrupamentoDaFolha" NOT NULL,
    "sistemaDeOrigem" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AgrupamentoDaFolhaNaLiquidacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgrupamentoDaFolhaNaLiquidacao_liquidacaoId_key" ON "AgrupamentoDaFolhaNaLiquidacao"("liquidacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "AgrupamentoDaFolhaNaLiquidacao_ugId_exercicio_codigo_key" ON "AgrupamentoDaFolhaNaLiquidacao"("ugId", "exercicio", "codigo");


-- AddForeignKey
ALTER TABLE "AgrupamentoDaFolhaNaLiquidacao" ADD CONSTRAINT "AgrupamentoDaFolhaNaLiquidacao_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrupamentoDaFolhaNaLiquidacao" ADD CONSTRAINT "AgrupamentoDaFolhaNaLiquidacao_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- MM + oito posições visíveis; o mês do código é o da competência da folha (AAAA-MM).
ALTER TABLE "AgrupamentoDaFolhaNaLiquidacao" ADD CONSTRAINT "AgrupamentoDaFolhaNaLiquidacao_codigo_check" CHECK ("codigo" ~ '^(0[1-9]|1[0-2])[!-~]{8}$');
ALTER TABLE "AgrupamentoDaFolhaNaLiquidacao" ADD CONSTRAINT "AgrupamentoDaFolhaNaLiquidacao_competencia_check" CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND substring("codigo" from 1 for 2) = substring("competencia" from 6 for 2));
