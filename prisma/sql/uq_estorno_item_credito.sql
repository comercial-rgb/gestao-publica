-- M03 — um ItemCredito só é estornado UMA vez.
-- Mesmo padrão dos demais índices parciais do projeto: @unique no FK forçaria
-- 1-1 e quebraria a lista `estornos`. O Prisma ignora índices parciais no diff.
CREATE UNIQUE INDEX uq_estorno_item_credito_unico
  ON "ItemCredito" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
