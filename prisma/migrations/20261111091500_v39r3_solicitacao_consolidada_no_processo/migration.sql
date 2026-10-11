-- V39-R3 (R3-019, M11) — a solicitacao de compra consolidada no processo licitatorio: o item do processo ganha o material
-- (anulavel) e as parcelas das solicitacoes ficam em tabela propria, append-only. Aditiva.

-- AlterTable
ALTER TABLE "ItemDoProcesso" ADD COLUMN     "materialId" TEXT;

-- CreateTable
CREATE TABLE "AlocacaoDeSolicitacaoNoProcesso" (
    "id" TEXT NOT NULL,
    "itemDeSolicitacaoId" TEXT NOT NULL,
    "itemDoProcessoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AlocacaoDeSolicitacaoNoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlocacaoDeSolicitacaoNoProcesso_itemDoProcessoId_idx" ON "AlocacaoDeSolicitacaoNoProcesso"("itemDoProcessoId");

-- CreateIndex
CREATE UNIQUE INDEX "AlocacaoDeSolicitacaoNoProcesso_itemDeSolicitacaoId_itemDoP_key" ON "AlocacaoDeSolicitacaoNoProcesso"("itemDeSolicitacaoId", "itemDoProcessoId");

-- AddForeignKey
ALTER TABLE "AlocacaoDeSolicitacaoNoProcesso" ADD CONSTRAINT "AlocacaoDeSolicitacaoNoProcesso_itemDeSolicitacaoId_fkey" FOREIGN KEY ("itemDeSolicitacaoId") REFERENCES "ItemDeSolicitacaoDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlocacaoDeSolicitacaoNoProcesso" ADD CONSTRAINT "AlocacaoDeSolicitacaoNoProcesso_itemDoProcessoId_fkey" FOREIGN KEY ("itemDoProcessoId") REFERENCES "ItemDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoProcesso" ADD CONSTRAINT "ItemDoProcesso_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_alocacao_no_processo_positiva') THEN
    ALTER TABLE "AlocacaoDeSolicitacaoNoProcesso" ADD CONSTRAINT "ck_alocacao_no_processo_positiva" CHECK ("quantidade" > 0);
  END IF;
END $$;
