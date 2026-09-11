-- M30 — um movimento de consórcio só pode ser estornado UMA VEZ.
--
-- Dois ESTORNO_REPASSE sobre o mesmo REPASSE devolveriam a cota em dobro, e o guard do
-- contrato de rateio — que confere a Σ dos repasses do exercício contra o teto — passaria
-- a autorizar repasse acima do que o art. 8º da Lei 11.107 permite.
CREATE UNIQUE INDEX uq_estorno_consorcio_unico
  ON "MovimentoConsorcio" ("estornoDeId")
  WHERE "estornoDeId" IS NOT NULL;
