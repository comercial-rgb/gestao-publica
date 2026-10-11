-- V39-R3 (R3-014, M07) — a previa da retencao: versao a partir de 1, valor previsto positivo, total nao negativo.
-- IDEMPOTENTE. Mesmo CHECK da migration 20261111090800.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_previa_de_retencao') THEN
    ALTER TABLE "PreviaDeRetencaoDaLiquidacao" ADD CONSTRAINT "ck_previa_de_retencao" CHECK ("versao" >= 1 AND "valorPrevisto" > 0 AND "totalPrevisto" >= 0);
  END IF;
END $$;
