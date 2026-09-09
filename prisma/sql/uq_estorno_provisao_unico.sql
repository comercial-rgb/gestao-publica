-- M10 — um movimento de provisão só pode ser estornado UMA VEZ.
--
-- Sem isto, dois ESTORNO_CONSTITUICAO zerariam o passivo atuarial DUAS VEZES: a
-- provisão ficaria NEGATIVA e o ente publicaria um passivo previdenciário menor do
-- que o cálculo atuarial mandou reconhecer.
CREATE UNIQUE INDEX uq_estorno_provisao_unico
  ON "MovimentoProvisao" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
