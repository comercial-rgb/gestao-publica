-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_PERFIL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONCEDER_ACAO_A_PERFIL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REVOGAR_ACAO_DE_PERFIL';
