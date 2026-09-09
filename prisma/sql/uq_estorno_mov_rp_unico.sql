-- M08 — um MovimentoRestosAPagar(PAGAMENTO) só pode ser estornado UMA vez.
--
-- Mesmo padrão dos demais índices parciais do projeto: um @unique no FK forçaria
-- a relação a 1-1 e quebraria a lista `estornos`. O índice único PARCIAL impõe a
-- invariante sem mudar o modelo, e o Prisma o ignora no diff (sem drift).
--
-- Sem isto, o saldo de RP poderia ser devolvido DUAS VEZES para a mesma anulação
-- — a inscrição passaria a ter mais saldo do que foi inscrito.
CREATE UNIQUE INDEX uq_estorno_mov_rp_unico
  ON "MovimentoRestosAPagar" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
