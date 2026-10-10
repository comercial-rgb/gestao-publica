-- V39-R2 (M11) — o evento do controle contábil do contrato é um conjunto FECHADO, com valor positivo; só o ESTORNO
-- aponta o elo que inverte (e todo ESTORNO aponta um). Barra o INSERT direto que o serviço já recusa.
-- IDEMPOTENTE (o global-setup aplica esta pasta a cada rodada). Mesmo CHECK da migration
-- 20261110060000_v39r2_controle_contabil_do_contrato.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_controle_contabil_do_contrato') THEN
    ALTER TABLE "LancamentoDeControleDoContrato" ADD CONSTRAINT "ck_controle_contabil_do_contrato" CHECK (
      "evento" IN ('REGISTRO', 'ACRESCIMO', 'SUPRESSAO', 'EXECUCAO', 'ESTORNO') AND "valor" > 0
      AND (("evento" = 'ESTORNO') = ("estornoDeId" IS NOT NULL))
    );
  END IF;
END $$;
