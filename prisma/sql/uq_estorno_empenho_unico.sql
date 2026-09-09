-- M05 — um Empenho só pode ser anulado UMA vez, e uma ReservaDotacao só pode
-- ser liberada UMA vez.
--
-- Mesmo padrão (e mesma razão) do uq_estorno_unico do M01: um @unique no FK
-- forçaria a relação a 1-1 e quebraria a lista `estornos`. O índice único
-- PARCIAL impõe a invariante sem mudar o modelo. Prisma não representa índices
-- parciais e os ignora no diff — não há drift.
--
-- Sem isto, a unicidade depende só do recheck na transação do adapter, que sob
-- READ COMMITTED pode não ver uma anulação concorrente.
CREATE UNIQUE INDEX uq_estorno_empenho_unico
  ON "Empenho" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;

CREATE UNIQUE INDEX uq_estorno_reserva_unico
  ON "ReservaDotacao" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
