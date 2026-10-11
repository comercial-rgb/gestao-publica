-- V39-R3 (R3-012, M10) — o ajuste do inventario do almoxarifado: so ha linha quando o contado difere do registrado, e as
-- quantidades nao sao negativas; a aplicacao diz o fundamento. IDEMPOTENTE. Mesmos CHECKs da migration 20261111090200.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ajuste_do_inventario') THEN
    ALTER TABLE "AjusteDoInventario" ADD CONSTRAINT "ck_ajuste_do_inventario" CHECK ("quantidadeRegistrada" >= 0 AND "quantidadeContada" >= 0 AND "quantidadeRegistrada" <> "quantidadeContada");
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_aplicacao_do_ajuste_do_inventario') THEN
    ALTER TABLE "AplicacaoDoAjusteDoInventario" ADD CONSTRAINT "ck_aplicacao_do_ajuste_do_inventario" CHECK (length(btrim("fundamento")) > 0);
  END IF;
END $$;
