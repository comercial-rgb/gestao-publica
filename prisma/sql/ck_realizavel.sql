-- V39-R3 (R3-016, M07) — movimento com valor positivo, devedor CPF/CNPJ em digitos, documento e historico; decisao com
-- fundamento, e categoria ativa so com conta. IDEMPOTENTE. Mesmos CHECKs da migration 20261111091200.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movimento_de_realizavel') THEN
    ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "ck_movimento_de_realizavel"
      CHECK ("valor" > 0 AND "devedor" ~ '^[0-9]{11}$|^[0-9]{14}$' AND length(btrim("documento")) > 0 AND length(btrim("historico")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_decisao_do_realizavel') THEN
    ALTER TABLE "DecisaoDaCategoriaDeRealizavel" ADD CONSTRAINT "ck_decisao_do_realizavel"
      CHECK (length(btrim("fundamento")) > 0 AND (NOT "ativa" OR "contaAtivoId" IS NOT NULL));
  END IF;
END $$;
