-- V39-R3 (R3-016, M09) — os tipos de movimento bancario que levam o realizavel ao caixa. Migration propria para os
-- valores de enum (`ALTER TYPE ... ADD VALUE` nao se usa na mesma transacao). Aditiva.
ALTER TYPE "TipoMovimentoBancario" ADD VALUE 'SAIDA_PARA_REALIZAVEL';
ALTER TYPE "TipoMovimentoBancario" ADD VALUE 'RETORNO_DE_REALIZAVEL';
