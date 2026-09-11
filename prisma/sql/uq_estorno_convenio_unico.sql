-- M28 — um movimento de convênio só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_LIBERACAO_DE_PARCELA apontando para a mesma LIBERACAO
-- devolveriam o valor em DOBRO: o convênio passaria a ter MAIS saldo a liberar do que
-- o termo autoriza, e o ente repassaria de novo o que já repassou.
--
-- Por que não é @unique no Prisma: um @unique no FK forçaria a relação de estorno a 1-1
-- e quebraria `estornos MovimentoConvenio[]`. Índice único PARCIAL (WHERE IS NOT NULL)
-- impõe a invariante sem mudar o modelo, e o Prisma ignora índices parciais no diff —
-- sem drift.
CREATE UNIQUE INDEX uq_estorno_convenio_unico
  ON "MovimentoConvenio" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
