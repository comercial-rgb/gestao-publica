-- M10 — um movimento patrimonial só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_* apontando para a mesma AQUISICAO devolveriam valor em
-- DOBRO: a classe (e o bem) passariam a valer MENOS do que a aquisição trouxe, e
-- o levantamento por classe (TR 5.15) mentiria para o TCE.
--
-- Por que não é @@unique no Prisma: um @unique no FK forçaria a relação de estorno
-- a 1-1 e quebraria `estornos MovimentoPatrimonial[]`. Índice único PARCIAL
-- (WHERE IS NOT NULL) impõe a invariante sem mudar o modelo.
-- O Prisma não representa índices parciais e os ignora no diff — sem drift.
CREATE UNIQUE INDEX uq_estorno_patrimonial_unico
  ON "MovimentoPatrimonial" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
