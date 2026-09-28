-- V22 — fecha o buraco do NULL nos CHECKs "todos ou nenhum" da TabelaIrrf. Aditiva: dois CHECKs
-- novos; os antigos ficam.
--
-- O defeito, medido: em SQL, `x > 0` com x NULO é NULO, e um CHECK NULO PASSA. Por isso
-- "TabelaIrrf_redutor_chk" aceitava base e fator preenchidos com a renda máxima nula, e
-- "TabelaIrrf_redutor_faixa_isenta_chk" aceitava a renda da faixa isenta sem o máximo — o teste
-- que gravou por fora do serviço passou onde devia ser recusado. O serviço sempre recusou; o banco não.
-- Aqui a presença é comparada com IS NULL, que nunca é nulo.

ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_redutor_presenca_chk" CHECK (
  ("redutorBase" IS NULL) = ("redutorFator" IS NULL)
  AND ("redutorBase" IS NULL) = ("redutorRendaMaxima" IS NULL)
);

ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_redutor_faixa_isenta_presenca_chk" CHECK (
  ("redutorRendaDaFaixaIsenta" IS NULL) = ("redutorMaximoNaFaixaIsenta" IS NULL)
  AND ("redutorRendaDaFaixaIsenta" IS NULL OR "redutorBase" IS NOT NULL)
);
