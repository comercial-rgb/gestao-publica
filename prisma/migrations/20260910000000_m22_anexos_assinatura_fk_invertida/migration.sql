-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'ANEXAR_ARQUIVO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ASSINAR_DOCUMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_FILA_DE_ASSINATURA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ASSINAR_NA_FILA';

-- DropForeignKey
ALTER TABLE "MovimentoDoComunicado" DROP CONSTRAINT "MovimentoDoComunicado_assinaturaId_fkey";

-- DropForeignKey
ALTER TABLE "MovimentoDoProcesso" DROP CONSTRAINT "MovimentoDoProcesso_assinaturaId_fkey";

-- DropIndex
DROP INDEX "MovimentoDoComunicado_assinaturaId_key";

-- DropIndex
DROP INDEX "MovimentoDoProcesso_assinaturaId_key";

-- AlterTable
ALTER TABLE "AssinaturaDeDocumento" ADD COLUMN     "movimentoComunicadoId" TEXT,
ADD COLUMN     "movimentoProcessoId" TEXT;

-- AlterTable
ALTER TABLE "MovimentoDoComunicado" DROP COLUMN "assinaturaId";

-- AlterTable
ALTER TABLE "MovimentoDoProcesso" DROP COLUMN "assinaturaId";

-- CreateIndex
CREATE UNIQUE INDEX "AssinaturaDeDocumento_movimentoProcessoId_key" ON "AssinaturaDeDocumento"("movimentoProcessoId");

-- CreateIndex
CREATE UNIQUE INDEX "AssinaturaDeDocumento_movimentoComunicadoId_key" ON "AssinaturaDeDocumento"("movimentoComunicadoId");

-- AddForeignKey
ALTER TABLE "AssinaturaDeDocumento" ADD CONSTRAINT "AssinaturaDeDocumento_movimentoProcessoId_fkey" FOREIGN KEY ("movimentoProcessoId") REFERENCES "MovimentoDoProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssinaturaDeDocumento" ADD CONSTRAINT "AssinaturaDeDocumento_movimentoComunicadoId_fkey" FOREIGN KEY ("movimentoComunicadoId") REFERENCES "MovimentoDoComunicado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

