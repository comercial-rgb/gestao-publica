-- V39-R3 (R3-020, M11) — preco estimado positivo, com ao menos um preco; regra com minimo e fonte. IDEMPOTENTE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_preco_estimado') THEN
    ALTER TABLE "PrecoEstimadoDoItem" ADD CONSTRAINT "ck_preco_estimado" CHECK ("valorEstimado" > 0 AND "precosUsados" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_regra_da_pesquisa') THEN
    ALTER TABLE "RegraDaPesquisaDePrecos" ADD CONSTRAINT "ck_regra_da_pesquisa" CHECK ("minimoDePrecos" >= 1 AND length(btrim("fonte")) > 0);
  END IF;
END $$;
