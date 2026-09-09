-- M10 — um movimento de almoxarifado só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_SAIDA_CONSUMO sobre a mesma SAÍDA devolveriam o material em
-- DOBRO: o almoxarifado teria mais estoque do que jamais entrou, e o inventário
-- físico nunca fecharia com o contábil.
--
-- Índice único PARCIAL (o Prisma não representa índices parciais e os ignora no diff).
CREATE UNIQUE INDEX uq_estorno_almoxarifado_unico
  ON "MovimentoAlmoxarifado" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
