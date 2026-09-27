-- O VALOR DE UMA PARCELA DE RECOLHIMENTO E SEMPRE POSITIVO (C34).
--
-- ⚠️ POR QUE UM CHECK, E NAO SO UM `if` NO CASO DE USO. O sinal do dinheiro
-- extraorcamentario vem do TIPO do movimento, nunca do valor — e a alocacao herda essa
-- regra: ela diz QUANTO daquele recolhimento quitou aquela retencao, e quanto negativo
-- ali inverteria a composicao em silencio. Um zero seria pior: uma linha de alocacao que
-- nao aloca nada, somando na contagem e nao no valor.
--
-- O caso de uso confere as SOMAS (Σ das parcelas == valor do recolhimento; Σ sobre um
-- ingresso ≤ o que ele ainda tem a recolher), porque CHECK nao soma linhas. Este guarda o
-- que entrar por seed, importacao ou correcao a mao.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_alocacao_recolhimento_positiva'
  ) THEN
    ALTER TABLE "AlocacaoDoRecolhimento"
      ADD CONSTRAINT ck_alocacao_recolhimento_positiva CHECK ("valor" > 0);
  END IF;
END $$;
