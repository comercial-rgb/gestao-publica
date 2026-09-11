-- M29 — um movimento de precatório só pode ser estornado UMA VEZ.
--
-- Dois ESTORNO_PAGAMENTO sobre o mesmo PAGAMENTO devolveriam o passivo em dobro: o
-- precatório voltaria a dever mais do que devia antes de ser pago, e a fila
-- constitucional passaria a mostrar um credor já quitado à frente de quem ainda espera.
CREATE UNIQUE INDEX uq_estorno_precatorio_unico
  ON "MovimentoPrecatorio" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
