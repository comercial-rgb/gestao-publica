-- M07 — um MovimentoExtraorcamentario só pode ser estornado UMA vez.
--
-- Índice PARCIAL (tem WHERE) — por isso vive aqui, e não no schema: o Prisma não
-- expressa `WHERE`. Um @unique no FK forçaria a relação a 1-1 e quebraria a lista
-- `estornos`.
--
-- Sem isto, o saldo do consignatário poderia ser devolvido DUAS VEZES pela mesma
-- anulação — o ente passaria a dever ao INSS mais do que reteve, ou a "ter"
-- dinheiro de terceiro que já devolveu.
CREATE UNIQUE INDEX uq_estorno_extra_unico
  ON "MovimentoExtraorcamentario" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
