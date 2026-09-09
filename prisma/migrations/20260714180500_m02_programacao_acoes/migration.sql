-- M02 — as 4 AÇÕES da programação financeira no enum AcaoDoSistema (TR 4.18/4.43/4.44).
-- ADITIVA: ALTER TYPE ... ADD VALUE. Migração separada (ADD VALUE não roda na mesma tx
-- que usa o enum — o mesmo par do reconhecimento).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_VERSAO_CMD';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_VERSAO_MBA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'LIBERAR_PROGRAMACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONFIGURAR_LIMITACAO_EMPENHO';

