-- V39-R3 (R3-023, M12) — subfunção de 3 dígitos, linha do manual positiva, versão positiva, sha em hexadecimal. IDEMPOTENTE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_da_correspondencia_siope') THEN
    ALTER TABLE "ItemDaCorrespondenciaSiope" ADD CONSTRAINT "ck_item_da_correspondencia_siope" CHECK ("subfuncaoCodigo" ~ '^[0-9]{3}$' AND "linhaNoManual" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_correspondencia_siope') THEN
    ALTER TABLE "CorrespondenciaSiope" ADD CONSTRAINT "ck_correspondencia_siope" CHECK ("versao" >= 1 AND "shaDoTexto" ~ '^[0-9a-f]{64}$' AND "shaDaTranscricao" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;
