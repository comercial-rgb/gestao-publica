-- V9 N2 — a consulta pública de bens precisa saber QUAIS localizações podem ser divulgadas.
--
-- Aditiva: uma coluna, com DEFAULT false. Nenhum DROP, nenhum backfill.
--
-- ⚠️ O DEFAULT false É A DECISÃO. Toda localização já cadastrada passa a ser NÃO publicável, e o
-- ente marca uma a uma as que podem aparecer. O contrário — publicar tudo e esconder depois — só
-- se percebe depois de o endereço do depósito de provas estar num CSV baixado.
ALTER TABLE "LocalizacaoFisica" ADD COLUMN "publicavelNaTransparencia" BOOLEAN NOT NULL DEFAULT false;
