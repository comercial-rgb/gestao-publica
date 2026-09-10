-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_LOTE_DE_PAGAMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'INCLUIR_NO_LOTE';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'FECHAR_LOTE';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERAR_BORDERO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'PROCESSAR_RETORNO_BANCARIO';

