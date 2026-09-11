-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'RELACIONAR_MARCA_AO_MATERIAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RELACIONAR_ELEMENTO_AO_MATERIAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_SOLICITACAO_DE_COMPRA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'MOVIMENTAR_SOLICITACAO_DE_COMPRA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_PESQUISA_DE_PRECOS';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'EMITIR_ORDEM_DE_COMPRA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_RECEBIMENTO_DE_ORDEM';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ESTORNAR_ORDEM_DE_COMPRA';
