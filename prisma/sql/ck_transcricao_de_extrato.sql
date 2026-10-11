-- V39-R3 (R3-015, M09) — a transcricao tem documento de suporte e a revisao diz como conferiu. IDEMPOTENTE.
-- Mesmos CHECKs da migration 20261111091000.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transcricao_de_extrato_documento') THEN
    ALTER TABLE "TranscricaoDeLinhaDeExtrato" ADD CONSTRAINT "ck_transcricao_de_extrato_documento" CHECK (length(btrim("documentoDeSuporte")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_revisao_da_transcricao_meio') THEN
    ALTER TABLE "RevisaoDaTranscricaoDeExtrato" ADD CONSTRAINT "ck_revisao_da_transcricao_meio" CHECK (length(btrim("meio")) > 0);
  END IF;
END $$;
