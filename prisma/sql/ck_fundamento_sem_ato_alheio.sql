-- V39-021 (M02, achado da auditoria) — na efetivação pela lei aprovada e no ensaio, nenhum campo do ato da execução
-- provisória vem preenchido. Complementa ck_fundamento_da_efetivacao, que só barrava o número do ato.
--
-- IDEMPOTENTE: o global-setup dos testes aplica esta pasta a cada rodada. Mesmo CHECK da migration
-- 20261110030000_v39_fundamento_sem_ato_alheio.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fundamento_sem_ato_alheio') THEN
    ALTER TABLE "EfetivacaoDaProposta" ADD CONSTRAINT "ck_fundamento_sem_ato_alheio" CHECK (
      "fundamento" IS NULL
      OR "fundamento" = 'EXECUCAO_PROVISORIA'
      OR ("atoTipo" IS NULL AND "atoNumero" IS NULL AND "atoAno" IS NULL AND "atoDispositivo" IS NULL AND "atoCitacao" IS NULL)
    );
  END IF;
END $$;
