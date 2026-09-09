-- M16 — nova ação REPREVISAR_RECEITA no enum AcaoDoSistema.
-- ADD VALUE em enum roda FORA de transação e SOZINHO (Postgres não permite usar o valor novo na
-- mesma transação que o adiciona) — por isso uma migração separada, só com o ADD VALUE.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REPREVISAR_RECEITA';
