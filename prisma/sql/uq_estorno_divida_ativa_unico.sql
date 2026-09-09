-- M10 — um movimento de dívida ATIVA só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_RECEBIMENTO sobre o mesmo RECEBIMENTO ressuscitariam o
-- crédito em DOBRO: o contribuinte que pagou passaria a dever MAIS do que devia
-- antes de pagar, e a certidão negativa dele nunca sairia.
--
-- Por que não é @unique no Prisma: um @unique no FK forçaria a relação a 1-1 e
-- quebraria `estornos MovimentoDividaAtiva[]`. Índice único PARCIAL impõe a
-- invariante sem mudar o modelo — e o Prisma o ignora no diff (sem drift).
CREATE UNIQUE INDEX uq_estorno_divida_ativa_unico
  ON "MovimentoDividaAtiva" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
