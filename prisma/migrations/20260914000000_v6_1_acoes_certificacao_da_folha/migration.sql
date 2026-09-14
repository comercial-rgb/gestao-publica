-- V6.1 — a certificação (atesto) da folha e a sua liquidação (TR 5.12.63-73): três ações.
--
-- DESIGNAR_NA_FOLHA administra as designações do ente (quem atesta, por qual ato, até quando).
-- CERTIFICAR_FOLHA é o atesto — e ele NÃO basta: exige designação vigente, conferida no ato.
-- LIQUIDAR_FOLHA é o ato de liquidar a competência certificada; quem o exerce precisa TAMBÉM de
-- LIQUIDAR (o M05 exige a sua própria ação, na unidade da ficha, dentro de cada transação).
-- SEPARADA das tabelas: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DESIGNAR_NA_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CERTIFICAR_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'LIQUIDAR_FOLHA';
