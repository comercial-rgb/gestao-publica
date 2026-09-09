-- M04 — uma ReceitaArrecadada só pode ser anulada UMA vez.
--
-- Mesmo padrão (e mesma razão) do uq_estorno_unico do M01: um @unique no FK
-- forçaria a relação EstornoReceita a 1-1 e quebraria `estornos
-- ReceitaArrecadada[]`. O índice único PARCIAL impõe a invariante sem mudar o
-- modelo. Prisma não representa índices parciais e os ignora no diff — não há
-- drift, e NÃO se "corrige" isso com @unique.
--
-- Sem este índice, a unicidade da anulação depende só do recheck na transação
-- do adapter, que sob READ COMMITTED pode não ver uma anulação concorrente.
CREATE UNIQUE INDEX uq_estorno_receita_unico
  ON "ReceitaArrecadada" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
