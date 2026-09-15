-- V7 M2 U5 — O ADITIVO POR ITENS: o termo que altera quantidade e/ou preço de itens do contrato a partir de uma vigência,
-- as versões por item e o estorno. A variação de valor continua sendo um MovimentoContratual (mesmo cadastro de aditivo).
-- Aditiva: nenhum item, ordem, medição ou movimento existente muda.
-- CreateTable
CREATE TABLE "AditivoPorItensDoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numeroAditivo" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "variacao" DECIMAL(18,2) NOT NULL,
    "movimentoContratualId" TEXT,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AditivoPorItensDoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlteracaoDeItemPorAditivo" (
    "id" TEXT NOT NULL,
    "aditivoId" TEXT NOT NULL,
    "itemDoContratoId" TEXT NOT NULL,
    "quantidadeAnterior" DECIMAL(18,4) NOT NULL,
    "valorUnitarioAnterior" DECIMAL(18,4) NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,4) NOT NULL,
    "medidoAntes" DECIMAL(18,4) NOT NULL,
    "variacao" DECIMAL(18,2) NOT NULL,
    "inclusao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlteracaoDeItemPorAditivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstornoDeAditivoPorItens" (
    "id" TEXT NOT NULL,
    "aditivoId" TEXT NOT NULL,
    "movimentoEstornoId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EstornoDeAditivoPorItens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AditivoPorItensDoContrato_movimentoContratualId_key" ON "AditivoPorItensDoContrato"("movimentoContratualId");

-- CreateIndex
CREATE INDEX "AditivoPorItensDoContrato_contratoId_idx" ON "AditivoPorItensDoContrato"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "AditivoPorItensDoContrato_contratoId_numeroAditivo_key" ON "AditivoPorItensDoContrato"("contratoId", "numeroAditivo");

-- CreateIndex
CREATE INDEX "AlteracaoDeItemPorAditivo_itemDoContratoId_idx" ON "AlteracaoDeItemPorAditivo"("itemDoContratoId");

-- CreateIndex
CREATE UNIQUE INDEX "AlteracaoDeItemPorAditivo_aditivoId_itemDoContratoId_key" ON "AlteracaoDeItemPorAditivo"("aditivoId", "itemDoContratoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstornoDeAditivoPorItens_aditivoId_key" ON "EstornoDeAditivoPorItens"("aditivoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstornoDeAditivoPorItens_movimentoEstornoId_key" ON "EstornoDeAditivoPorItens"("movimentoEstornoId");
-- AddForeignKey
ALTER TABLE "AditivoPorItensDoContrato" ADD CONSTRAINT "AditivoPorItensDoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AditivoPorItensDoContrato" ADD CONSTRAINT "AditivoPorItensDoContrato_movimentoContratualId_fkey" FOREIGN KEY ("movimentoContratualId") REFERENCES "MovimentoContratual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeItemPorAditivo" ADD CONSTRAINT "AlteracaoDeItemPorAditivo_aditivoId_fkey" FOREIGN KEY ("aditivoId") REFERENCES "AditivoPorItensDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeItemPorAditivo" ADD CONSTRAINT "AlteracaoDeItemPorAditivo_itemDoContratoId_fkey" FOREIGN KEY ("itemDoContratoId") REFERENCES "ItemDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstornoDeAditivoPorItens" ADD CONSTRAINT "EstornoDeAditivoPorItens_aditivoId_fkey" FOREIGN KEY ("aditivoId") REFERENCES "AditivoPorItensDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstornoDeAditivoPorItens" ADD CONSTRAINT "EstornoDeAditivoPorItens_movimentoEstornoId_fkey" FOREIGN KEY ("movimentoEstornoId") REFERENCES "MovimentoContratual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A alteração tem de mudar algo, e não há quantidade ou unitário negativo.
ALTER TABLE "AlteracaoDeItemPorAditivo" ADD CONSTRAINT "ck_alteracao_de_item_por_aditivo" CHECK (
  "quantidade" >= 0 AND "valorUnitario" >= 0 AND "quantidadeAnterior" >= 0 AND "valorUnitarioAnterior" >= 0 AND "medidoAntes" >= 0
  AND ("quantidade" <> "quantidadeAnterior" OR "valorUnitario" <> "valorUnitarioAnterior")
  AND (NOT "inclusao" OR ("quantidadeAnterior" = 0 AND "quantidade" > 0))
);
