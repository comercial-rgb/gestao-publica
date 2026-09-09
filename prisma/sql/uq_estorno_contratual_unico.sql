-- M11 — um movimento contratual só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_ACRESCIMO_VALOR apontando para o mesmo ACRESCIMO
-- devolveriam o valor em DOBRO: o contrato passaria a valer MENOS do que valia
-- antes do aditivo, e o saldo contra o qual se empenha (bloco 2) mentiria.
--
-- Por que não é @unique no Prisma: um @unique no FK forçaria a relação de estorno
-- a 1-1 e quebraria `estornos MovimentoContratual[]`. Índice único PARCIAL
-- (WHERE IS NOT NULL) impõe a invariante sem mudar o modelo.
-- O Prisma não representa índices parciais e os ignora no diff — sem drift.
CREATE UNIQUE INDEX uq_estorno_contratual_unico
  ON "MovimentoContratual" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
