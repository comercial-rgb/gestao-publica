-- V6 P2.3 — o regime previdenciário no EVENTO do vínculo. `regimeVigenteEm` deriva dele; a coluna
-- `Vinculo.regimePrevidenciario` passa a ser lida como o regime DA ADMISSÃO (e o fallback dos
-- vínculos criados antes de o evento existir).
ALTER TABLE "HistoricoVinculo" ADD COLUMN "regimePrevidenciario" "RegimePrevidenciario";

-- BICONDICIONAL, na mesma disciplina dos CHECKs vizinhos: só a mudança de regime traz regime — e
-- a admissão o traz quando o vínculo o declara (ela pode nascer sem, como os vínculos legados).
-- Um afastamento que carregasse regime mudaria a contribuição sem que ninguém tivesse pedido.
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_regime"
  CHECK (
    "regimePrevidenciario" IS NULL
    OR "tipo" IN ('ADMISSAO', 'MUDANCA_REGIME_PREVIDENCIARIO')
  );
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_regime_exigido"
  CHECK ("tipo" <> 'MUDANCA_REGIME_PREVIDENCIARIO' OR "regimePrevidenciario" IS NOT NULL);
