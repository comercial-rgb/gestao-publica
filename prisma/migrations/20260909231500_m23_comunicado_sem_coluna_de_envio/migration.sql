-- DropForeignKey
ALTER TABLE "Comunicado" DROP CONSTRAINT "Comunicado_assinaturaId_fkey";

-- DropIndex
DROP INDEX "Comunicado_assinaturaId_key";

-- AlterTable
ALTER TABLE "Comunicado" DROP COLUMN "assinaturaId",
DROP COLUMN "enviadoEm";

