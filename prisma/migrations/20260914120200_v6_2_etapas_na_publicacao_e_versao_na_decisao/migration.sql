-- V6.2 P3 — a cópia das etapas e a versão do cadastro deferida passam a ser gravadas por INSERT.
-- O papel de runtime não tem UPDATE em "VersaoDoServico" nem em "PropostaDeAlteracaoCadastral";
-- as colunas antigas ("etapasPublicadas", "versaoAplicadaId") ficam sem escritor (aditiva, zero DROP).
-- A publicação e a decisão nasceram nesta mesma entrega e não têm linha em instalação nenhuma:
-- a coluna de etapas nasce NOT NULL sem valor padrão inventado.
ALTER TABLE "PublicacaoDoServico" ADD COLUMN "etapas" JSONB NOT NULL;
ALTER TABLE "DecisaoDaSolicitacao" ADD COLUMN "versaoDoCadastroId" TEXT;
