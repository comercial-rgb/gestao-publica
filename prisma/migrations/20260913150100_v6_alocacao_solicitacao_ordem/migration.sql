-- V6 P1.1 — a alocação solicitação × ordem, por item e quantidade (append-only; desfazer é linha nova).
-- DDL gerada por `prisma migrate diff` sobre o schema local; CHECK e unicidade parcial abaixo.

-- CreateTable
CREATE TABLE "AlocacaoDeSolicitacaoNaOrdem" (
    "id" TEXT NOT NULL,
    "itemDeSolicitacaoId" TEXT NOT NULL,
    "itemDeOrdemId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AlocacaoDeSolicitacaoNaOrdem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlocacaoDeSolicitacaoNaOrdem_estornoDeId_key" ON "AlocacaoDeSolicitacaoNaOrdem"("estornoDeId");

-- CreateIndex
CREATE INDEX "AlocacaoDeSolicitacaoNaOrdem_itemDeSolicitacaoId_idx" ON "AlocacaoDeSolicitacaoNaOrdem"("itemDeSolicitacaoId");

-- CreateIndex
CREATE INDEX "AlocacaoDeSolicitacaoNaOrdem_itemDeOrdemId_idx" ON "AlocacaoDeSolicitacaoNaOrdem"("itemDeOrdemId");

-- AddForeignKey
ALTER TABLE "AlocacaoDeSolicitacaoNaOrdem" ADD CONSTRAINT "AlocacaoDeSolicitacaoNaOrdem_itemDeSolicitacaoId_fkey" FOREIGN KEY ("itemDeSolicitacaoId") REFERENCES "ItemDeSolicitacaoDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlocacaoDeSolicitacaoNaOrdem" ADD CONSTRAINT "AlocacaoDeSolicitacaoNaOrdem_itemDeOrdemId_fkey" FOREIGN KEY ("itemDeOrdemId") REFERENCES "ItemDeOrdemDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlocacaoDeSolicitacaoNaOrdem" ADD CONSTRAINT "AlocacaoDeSolicitacaoNaOrdem_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "AlocacaoDeSolicitacaoNaOrdem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Quantidade sempre positiva; o desfazimento repete a quantidade da original com `estornoDeId`.
ALTER TABLE "AlocacaoDeSolicitacaoNaOrdem" ADD CONSTRAINT "ck_alocacao_quantidade_positiva"
  CHECK ("quantidade" > 0);
-- Motivo anda com o estorno: linha original sem motivo, linha de estorno com motivo.
ALTER TABLE "AlocacaoDeSolicitacaoNaOrdem" ADD CONSTRAINT "ck_alocacao_motivo_do_estorno"
  CHECK (("estornoDeId" IS NULL) = ("motivo" IS NULL));
