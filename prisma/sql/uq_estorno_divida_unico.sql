-- M10 — um movimento de dívida só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_AMORTIZACAO apontando para a mesma AMORTIZACAO devolveriam
-- o saldo em DOBRO: a dívida passaria a valer MAIS do que valia antes do pagamento,
-- e o ente amortizaria de novo o que já pagou.
--
-- Por que não é @unique no Prisma: um @unique no FK forçaria a relação de estorno a
-- 1-1 e quebraria `estornos MovimentoDivida[]`. Índice único PARCIAL (WHERE IS NOT
-- NULL) impõe a invariante sem mudar o modelo. O Prisma não representa índices
-- parciais e os ignora no diff — sem drift.
CREATE UNIQUE INDEX uq_estorno_divida_unico
  ON "MovimentoDivida" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
