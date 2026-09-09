-- M04 — as 3 AÇÕES do reconhecimento no enum AcaoDoSistema (TR 5.87/5.88).
-- ADITIVA: ALTER TYPE ... ADD VALUE. Nenhum valor existente é tocado.
-- (Migração separada da criação das tabelas: no Postgres, ADD VALUE a um enum não pode
--  rodar na mesma transação que o USA — daí o par de migrações.)

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'RECONHECER_RECEITA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ESTORNAR_RECONHECIMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CANCELAR_RECONHECIMENTO';

