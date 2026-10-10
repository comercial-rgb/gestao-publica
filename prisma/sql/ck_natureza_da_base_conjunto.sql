-- V39-001/002 (M16) — a natureza da base é um conjunto FECHADO, com motivo e número positivo.
--
-- O serviço (`modules/m16-travamento/natureza-da-base.ts`) já recusa outro valor; este CHECK barra o INSERT DIRETO
-- (console, correção à mão), que é por onde uma natureza escrita errado passaria — e uma natureza desconhecida lida
-- como "não oficial" abriria a base a percursos que gravam. O leitor também trata valor fora do conjunto como não
-- declarada (fail-closed); o CHECK impede que ele chegue lá.
--
-- IDEMPOTENTE: o global-setup dos testes aplica esta pasta a cada rodada. Mesmo CHECK da migration
-- 20261110010000_v39_natureza_da_base.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_natureza_da_base_conjunto') THEN
    ALTER TABLE "DeclaracaoDaNaturezaDaBase"
      ADD CONSTRAINT ck_natureza_da_base_conjunto
      CHECK ("natureza" IN ('OFICIAL', 'DEMONSTRACAO', 'ENSAIO') AND length(btrim("motivo")) > 0 AND "numero" > 0);
  END IF;
END $$;
