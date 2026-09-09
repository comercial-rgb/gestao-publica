-- M11 — a BICONDICIONAL do art. 75: DISPENSA ⟺ hipótese informada.
--
-- Dispensa SEM hipótese é uma contratação direta sem base legal — e é exatamente o
-- que o TCE procura primeiro. Hipótese SEM dispensa é ruído que faria o relatório
-- 5.103 classificar como contratação direta um pregão comum.
--
-- ⚠️ POR QUE A COLUNA MORA NO **PROCESSO**, E NÃO NO CONTRATO: um CHECK do Postgres
-- não atravessa tabelas. `modalidade` é do ProcessoLicitatorio; pendurar a hipótese
-- no Contrato tornaria esta bicondicional INEXEQUÍVEL no banco (só um trigger a
-- alcançaria). E o processo é o dono legítimo dela: quem dispensa a licitação é o
-- processo — o contrato apenas executa o que ele decidiu.
--
-- IDEMPOTENTE (o global-setup reaplica esta pasta a cada rodada, e o banco de teste
-- persiste): `ADD CONSTRAINT` não tem IF NOT EXISTS no Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_hipotese_dispensa'
  ) THEN
    ALTER TABLE "ProcessoLicitatorio"
      ADD CONSTRAINT ck_hipotese_dispensa CHECK (
        ("modalidade" = 'DISPENSA' AND "hipoteseDispensa" IS NOT NULL)
        OR
        ("modalidade" <> 'DISPENSA' AND "hipoteseDispensa" IS NULL)
      );
  END IF;
END $$;
