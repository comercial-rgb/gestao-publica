-- V39-R3 (R3-017, M05) — a referencia externa diz sistema, identificador e documento (nao vazios); a conferencia diz
-- como conferiu. IDEMPOTENTE. Mesmos CHECKs da migration 20261111090700.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_referencia_externa_do_empenho') THEN
    ALTER TABLE "ReferenciaExternaDoEmpenho" ADD CONSTRAINT "ck_referencia_externa_do_empenho" CHECK (length(btrim("sistemaDeOrigem")) > 0 AND length(btrim("identificador")) > 0 AND length(btrim("documento")) > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_conferencia_da_referencia_externa') THEN
    ALTER TABLE "ConferenciaDaReferenciaExterna" ADD CONSTRAINT "ck_conferencia_da_referencia_externa" CHECK (length(btrim("meio")) > 0);
  END IF;
END $$;
