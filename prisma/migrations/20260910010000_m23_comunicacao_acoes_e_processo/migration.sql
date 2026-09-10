-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CRIAR_TIPO_DE_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RASCUNHAR_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'EDITAR_RASCUNHO_DE_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ENVIAR_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'RESPONDER_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ENCAMINHAR_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'MARCAR_LEITURA_DE_COMUNICADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_MINHA_CAIXA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ETIQUETAR_COMUNICADO';

-- AlterTable
ALTER TABLE "Comunicado" ADD COLUMN     "processoId" TEXT;

-- CreateIndex
CREATE INDEX "Comunicado_processoId_idx" ON "Comunicado"("processoId");

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

