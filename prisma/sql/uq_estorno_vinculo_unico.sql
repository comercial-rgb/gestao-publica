-- M09 — um vínculo de conciliação só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_VINCULO apontando para o mesmo VINCULO devolveriam
-- capacidade de conciliação em DOBRO: o lançamento do extrato voltaria a "ter
-- espaço" para um valor que nunca foi desvinculado, e a conciliação passaria a
-- casar dinheiro que não existe.
--
-- Por que não é @@unique no Prisma: um @unique no FK forçaria a relação de
-- estorno a 1-1 e quebraria `estornos VinculoConciliacao[]`. Índice único
-- PARCIAL (WHERE IS NOT NULL) impõe a invariante sem mudar o modelo.
-- O Prisma não representa índices parciais e os ignora no diff — sem drift.
CREATE UNIQUE INDEX uq_estorno_vinculo_unico
  ON "VinculoConciliacao" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
