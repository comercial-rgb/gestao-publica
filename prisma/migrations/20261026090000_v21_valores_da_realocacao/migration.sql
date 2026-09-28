-- V21 — os valores de enum da REALOCAÇÃO DE DOTAÇÃO (remanejamento, transposição e transferência,
-- Constituição, art. 167, VI).
--
-- Migration PROPRIA, separada das tabelas: `ALTER TYPE ... ADD VALUE` não pode ter o valor novo
-- USADO na mesma transação, e o Prisma roda cada migration numa transação. Lição da V15, prática
-- desde a V16.
--
-- ⚠️ DOIS TIPOS DE MOVIMENTO DE DOTAÇÃO, e não um quarto `TipoCredito`: a realocação move dotação
-- que já existe, por lei específica, fora do limite de crédito adicional que aquele enum governa.
-- ⚠️ DUAS AÇÕES, registrar e anular, a mesma segregação de EXECUTAR_CREDITO e ANULAR_CREDITO.

ALTER TYPE "TipoMovimentoDotacao" ADD VALUE 'REALOCACAO_ACRESCIMO';
ALTER TYPE "TipoMovimentoDotacao" ADD VALUE 'REALOCACAO_REDUCAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_REALOCACAO_DE_DOTACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ANULAR_REALOCACAO_DE_DOTACAO';
