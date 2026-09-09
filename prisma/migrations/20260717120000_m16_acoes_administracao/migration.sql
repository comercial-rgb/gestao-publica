-- M16 — as 6 AÇÕES da administração de usuários no enum AcaoDoSistema (TR 4.55/4.56).
-- ADITIVA: ALTER TYPE ... ADD VALUE. Nenhum valor existente é tocado.
-- (Migração SEPARADA: no Postgres, ADD VALUE a um enum não pode rodar na mesma transação
--  que o USA — o mesmo par do reconhecimento (M04) e da programação (M02).)

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_USUARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONCEDER_PERFIL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REVOGAR_PERFIL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ATIVAR_USUARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'INATIVAR_USUARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RESETAR_SENHA';
