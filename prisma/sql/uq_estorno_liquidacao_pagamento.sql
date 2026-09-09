-- M05 bloco 2 — uma Liquidacao só é anulada UMA vez; um Pagamento também.
--
-- Mesmo padrão dos demais índices parciais do projeto: um @unique no FK forçaria
-- a relação a 1-1 e quebraria a lista `estornos`. O índice único PARCIAL impõe a
-- invariante sem mudar o modelo, e o Prisma o ignora no diff (sem drift).
CREATE UNIQUE INDEX uq_estorno_liquidacao_unico
  ON "Liquidacao" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;

CREATE UNIQUE INDEX uq_estorno_pagamento_unico
  ON "Pagamento" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
