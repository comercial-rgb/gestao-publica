-- V36 (TR 5.9.1.8) — a unidade do código reduzido é a da CLASSIFICAÇÃO, com o mesmo nome da AcaoPpa
-- (unidadeExecutoraId): `unidadeOrcId` é a coluna que marca fato de unidade (escopo.ts), e o código reduzido é ato do
-- ente. Renomeia a coluna, a chave estrangeira e o índice (sem DROP; a tabela nasceu na migration anterior).
ALTER TABLE "CodigoReduzidoDaDespesaPpa" RENAME COLUMN "unidadeOrcId" TO "unidadeExecutoraId";
ALTER TABLE "CodigoReduzidoDaDespesaPpa" RENAME CONSTRAINT "CodigoReduzidoDaDespesaPpa_unidadeOrcId_fkey" TO "CodigoReduzidoDaDespesaPpa_unidadeExecutoraId_fkey";
