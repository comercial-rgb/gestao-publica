-- V26 — um pagamento tem no máximo UMA retenção própria viva por fato (IR da folha, IR de PJ, ISS).
--
-- Parcial porque a linha do estorno repete o pagamento e o fato. Prisma não representa índice parcial e o
-- ignora no diff — não há deriva, e não se "corrige" isso com @@unique.
CREATE UNIQUE INDEX uq_retencao_propria_viva
  ON "RetencaoPropriaDoPagamento" ("pagamentoId", "fato")
  WHERE "estornoDeId" IS NULL;
