-- V39-R3 (R3-019, M11) — a parcela da solicitacao no processo tem quantidade positiva. IDEMPOTENTE. Mesmo CHECK da migration 20261111091500.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_alocacao_no_processo_positiva') THEN
    ALTER TABLE "AlocacaoDeSolicitacaoNoProcesso" ADD CONSTRAINT "ck_alocacao_no_processo_positiva" CHECK ("quantidade" > 0);
  END IF;
END $$;
