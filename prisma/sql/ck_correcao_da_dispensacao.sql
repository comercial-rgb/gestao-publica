-- V39-R3 (R3-009/010, M37) — a correcao do item da dispensacao e a troca do deposito da farmacia. IDEMPOTENTE (o
-- global-setup aplica esta pasta a cada rodada). Mesmos CHECKs da migration 20261111090100.
--   cancelamento: sem condicao e sem destino, com o estorno fisico;
--   devolucao: com quem conferiu; apta volta ao estoque (estorno fisico, sem destino); inapta nao volta (sem estorno) e
--   diz o destino.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_correcao_do_item_da_dispensacao') THEN
    ALTER TABLE "CorrecaoDoItemDaDispensacao" ADD CONSTRAINT "ck_correcao_do_item_da_dispensacao" CHECK (
      length(btrim("motivo")) > 0 AND (
        ("tipo" = 'CANCELAMENTO_DO_REGISTRO' AND "condicao" IS NULL AND "destino" IS NULL AND "movimentoFisicoId" IS NOT NULL)
        OR ("tipo" = 'DEVOLUCAO' AND "conferidoPor" IS NOT NULL AND length(btrim("conferidoPor")) > 0 AND (
          ("condicao" = 'APTO_AO_REUSO' AND "movimentoFisicoId" IS NOT NULL AND "destino" IS NULL)
          OR ("condicao" = 'INAPTO' AND "movimentoFisicoId" IS NULL AND "destino" IS NOT NULL AND length(btrim("destino")) > 0)))));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_troca_do_deposito_da_farmacia') THEN
    ALTER TABLE "TrocaDoDepositoDaFarmacia" ADD CONSTRAINT "ck_troca_do_deposito_da_farmacia" CHECK ("depositoAnteriorId" <> "depositoNovoId" AND length(btrim("fundamento")) > 0);
  END IF;
END $$;
