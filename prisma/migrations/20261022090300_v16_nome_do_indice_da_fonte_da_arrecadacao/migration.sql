-- V16 — o NOME do indice unico da parcela de fonte, alinhado ao que o Prisma espera.
--
-- ⚠️ O QUE A `npm run deriva` ACUSOU, E POR QUE ELA ESTAVA CERTA. A migration da tabela escreveu
--
--     CREATE UNIQUE INDEX "FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFonte_key"
--
-- com 65 caracteres. O PostgreSQL TRUNCA identificador em 63 bytes e ficou
-- `..._exercicioFonte_k` — cortando o sufixo `_key`. O Prisma trunca de outro jeito: ele PRESERVA o
-- sufixo e encurta o meio (`..._exercicioFon_key`). Nomes diferentes para o mesmo indice, e a
-- consequencia nao e cosmetica: a proxima migration gerada pelo Prisma DERRUBARIA o indice
-- truncado para criar o dele — o mesmo desenho do `MovimentoBancario_fonteId_idx` que a deriva
-- existe para pegar. A trava de unicidade da parcela sumiria em silencio, numa migration que
-- ninguem leria linha a linha.
--
-- ADITIVA E IDEMPOTENTE: renomeia SO se o nome truncado existir. Zero DROP, zero recriacao — o
-- indice e o mesmo objeto, com o nome que o modelo espera. A migration anterior NAO foi reescrita.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFonte_k'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFon_key'
  ) THEN
    ALTER INDEX "FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFonte_k"
      RENAME TO "FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFon_key";
  END IF;
END $$;
