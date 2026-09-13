-- Sessão noturna V4 (§6) — a entrada física que a liquidação produz pode CONSUMIR um recebimento
-- da ordem de compra (M11) já registrado. ADITIVA: uma coluna anulável, um índice, uma FK.
ALTER TABLE "MovimentoFisicoDeEstoque" ADD COLUMN "recebimentoDeItemId" TEXT;
CREATE INDEX "MovimentoFisicoDeEstoque_recebimentoDeItemId_idx" ON "MovimentoFisicoDeEstoque"("recebimentoDeItemId");
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_recebimentoDeItemId_fkey" FOREIGN KEY ("recebimentoDeItemId") REFERENCES "RecebimentoDeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
