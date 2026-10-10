-- V39-R2 (R2-030/031, M37) — a PERDA na farmacia diz para onde foi o produto (descarte, devolucao, ocorrencia); a sobra
-- nao tem destino. Quantidades positivas (o sentido e a coluna `sentido`). IDEMPOTENTE (o global-setup aplica esta pasta
-- a cada rodada). Mesmos CHECKs da migration 20261110120000_v39r2_dispensacao_e_ajuste_da_farmacia.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ajuste_da_farmacia') THEN
    ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "ck_ajuste_da_farmacia" CHECK ("quantidade" > 0 AND (("sentido" = 'SOBRA' AND "destino" IS NULL) OR ("sentido" = 'PERDA' AND "destino" IS NOT NULL AND length(btrim("destino")) > 0)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_da_dispensacao') THEN
    ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ck_item_da_dispensacao" CHECK ("quantidade" > 0);
  END IF;
END $$;
