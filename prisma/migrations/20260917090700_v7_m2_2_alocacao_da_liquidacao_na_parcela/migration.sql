-- V7 M2 U3 — A ALOCAÇÃO DA LIQUIDAÇÃO NA PARCELA RECEBIDA: quanto de cada recebimento definitivo uma liquidação do M05
-- consumiu. Gravada na MESMA transação da liquidação, sob o trinco do contrato. Aditiva; nenhuma liquidação muda.
CREATE TABLE "AlocacaoDaLiquidacaoNaParcela" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "recebimentoDefinitivoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "AlocacaoDaLiquidacaoNaParcela_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_alocacao_da_liquidacao_na_parcela" CHECK ("valor" > 0)
);
CREATE UNIQUE INDEX "AlocacaoDaLiquidacaoNaParcela_liquidacaoId_recebimentoDefinitivoId_key" ON "AlocacaoDaLiquidacaoNaParcela"("liquidacaoId", "recebimentoDefinitivoId");
CREATE INDEX "AlocacaoDaLiquidacaoNaParcela_recebimentoDefinitivoId_idx" ON "AlocacaoDaLiquidacaoNaParcela"("recebimentoDefinitivoId");
ALTER TABLE "AlocacaoDaLiquidacaoNaParcela" ADD CONSTRAINT "AlocacaoDaLiquidacaoNaParcela_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlocacaoDaLiquidacaoNaParcela" ADD CONSTRAINT "AlocacaoDaLiquidacaoNaParcela_recebimentoDefinitivoId_fkey" FOREIGN KEY ("recebimentoDefinitivoId") REFERENCES "RecebimentoDefinitivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
