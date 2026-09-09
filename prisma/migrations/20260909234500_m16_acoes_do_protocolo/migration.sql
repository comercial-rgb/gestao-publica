-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'ABRIR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'TRAMITAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RECEBER_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'COMPLEMENTAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'SOLICITAR_PARECER';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RESPONDER_PARECER';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'SOLICITAR_READEQUACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ATENDER_READEQUACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ENCERRAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ARQUIVAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REABRIR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'APENSAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DESAPENSAR_PROCESSO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'TORNAR_MOVIMENTO_SEM_EFEITO';

