-- aplicar como migration manual pós prisma migrate, quando houver Postgres:
-- garante no banco que um lançamento só pode ser estornado uma vez
--
-- Por que não é @@unique no Prisma: um @unique no FK forçaria a relação
-- Estorno a 1-1 e quebraria `estornos LancamentoContabil[]`. Índice único
-- parcial (WHERE IS NOT NULL) impõe a invariante sem mudar o modelo.
-- Prisma pode reportar drift — esperado; não "corrigir" com @unique.
CREATE UNIQUE INDEX uq_estorno_unico
  ON "LancamentoContabil" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
