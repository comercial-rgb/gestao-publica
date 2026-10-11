-- V39-R3 (R3-016, M07) — as acoes do realizavel de natureza ativa: parametrizar (categoria e conta decidida pelo ente)
-- e movimentar (constituir, baixar, anular). Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma
-- transacao em que e criado. Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'PARAMETRIZAR_REALIZAVEL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'MOVIMENTAR_REALIZAVEL';
