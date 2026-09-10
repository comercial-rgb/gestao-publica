-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_SETOR';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'LOTAR_USUARIO_NO_SETOR';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_ASSUNTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_TAXA_DO_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'BAIXAR_TAXA_DO_PROCESSO';

