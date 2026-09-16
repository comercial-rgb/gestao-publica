-- V11 V1.1 — a natureza FORMULA da rubrica. Aditiva: um valor de enum.
--
-- ⚠️ ARQUIVO PRÓPRIO, pela mesma razão registrada em
-- `20260924090200_v10_t2_acoes_tributarias`: no Postgres o valor novo de um enum só pode ser
-- USADO depois que a transação que o adicionou tiver commitado, e o Prisma envolve cada
-- migration numa transação. Juntar o `ALTER TYPE` com a tabela que o referencia quebra na
-- instalação limpa e passa no banco que já tinha o valor — o pior modo de falha possível.
ALTER TYPE "NaturezaDaRubrica" ADD VALUE IF NOT EXISTS 'FORMULA';
