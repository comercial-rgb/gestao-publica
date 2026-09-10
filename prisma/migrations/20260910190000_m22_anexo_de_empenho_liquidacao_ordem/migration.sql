-- ============================================================================
-- M22/M05 (ENT03a) — empenho, liquidacao e ordem de pagamento tambem sao
-- DOCUMENTOS, e entram na fila de assinaturas do ENT02.
--
-- Ate aqui so o bordero entrava, e a assimetria era arbitraria: a nota de
-- empenho e o documento que o ordenador assina, e e ela que o TCE pede assinada
-- — mais do que o bordero, que e instrumento bancario.
--
-- Aditiva: tres colunas nullable, tres FKs, tres indices. Nenhum DROP.
-- ============================================================================

ALTER TABLE "Anexo" ADD COLUMN "empenhoId" TEXT;
ALTER TABLE "Anexo" ADD COLUMN "liquidacaoId" TEXT;
ALTER TABLE "Anexo" ADD COLUMN "ordemDePagamentoId" TEXT;

CREATE INDEX "Anexo_empenhoId_idx" ON "Anexo"("empenhoId");
CREATE INDEX "Anexo_liquidacaoId_idx" ON "Anexo"("liquidacaoId");
CREATE INDEX "Anexo_ordemDePagamentoId_idx" ON "Anexo"("ordemDePagamentoId");

ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_empenhoId_fkey"
  FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_liquidacaoId_fkey"
  FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_ordemDePagamentoId_fkey"
  FOREIGN KEY ("ordemDePagamentoId") REFERENCES "OrdemDePagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
