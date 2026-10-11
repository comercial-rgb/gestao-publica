-- V39-R2 (M05) — o comprovante da aplicação do adiantamento tem valor positivo. IDEMPOTENTE (o global-setup aplica esta
-- pasta a cada rodada). Mesmo CHECK da migration 20261110150000_v39r2_comprovantes_do_adiantamento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_comprovante_do_adiantamento') THEN
    ALTER TABLE "ComprovanteDaPrestacaoDoAdiantamento" ADD CONSTRAINT "ck_comprovante_do_adiantamento" CHECK ("valor" > 0);
  END IF;
END $$;
