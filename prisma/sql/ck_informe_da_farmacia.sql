-- V39-R3 (R3-022, M37) — mês válido na adoção do modo; código do produto só com dígitos (o mesmo do item do informe). IDEMPOTENTE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_modo_do_informe_mes') THEN
    ALTER TABLE "ModoDoInformeAdotado" ADD CONSTRAINT "ck_modo_do_informe_mes" CHECK ("desdeMes" BETWEEN 1 AND 12 AND "desdeAno" >= 2000 AND length(btrim("fundamento")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_codigo_do_material_no_informe') THEN
    ALTER TABLE "CodigoDoMaterialNoInforme" ADD CONSTRAINT "ck_codigo_do_material_no_informe" CHECK ("codigoProduto" ~ '^[0-9]{1,14}$' AND length(btrim("descricao")) >= 2);
  END IF;
END $$;
