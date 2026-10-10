-- V39-021 (M02) — a efetivação da proposta guarda o que permitiu executar, na forma do fundamento.
--
-- O caso de uso (`efetivarPropostaOrcamentaria`) já exige o fundamento e o confere; este CHECK barra o INSERT DIRETO
-- (script, correção à mão) que gravaria "lei aprovada" sem a aprovação, ou "execução provisória" sem o ato. Fundamento
-- nulo é a efetivação anterior à V39 (nada era exigido) e continua aceito: o histórico não se reescreve.
--
-- IDEMPOTENTE: o global-setup dos testes aplica esta pasta a cada rodada. Mesmo CHECK da migration
-- 20261110020000_v39_fundamento_da_efetivacao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fundamento_da_efetivacao') THEN
    ALTER TABLE "EfetivacaoDaProposta" ADD CONSTRAINT "ck_fundamento_da_efetivacao" CHECK (
      "fundamento" IS NULL
      OR ("fundamento" = 'LEI_APROVADA' AND "leiId" IS NOT NULL AND "aprovacaoId" IS NOT NULL AND "atoNumero" IS NULL)
      OR ("fundamento" = 'EXECUCAO_PROVISORIA' AND "leiId" IS NULL AND "aprovacaoId" IS NULL AND "atoTipo" IS NOT NULL
          AND "atoNumero" IS NOT NULL AND "atoAno" IS NOT NULL AND "atoDispositivo" IS NOT NULL AND "atoCitacao" IS NOT NULL)
      OR ("fundamento" = 'ENSAIO' AND "leiId" IS NULL AND "aprovacaoId" IS NULL AND "atoNumero" IS NULL)
    );
  END IF;
END $$;
