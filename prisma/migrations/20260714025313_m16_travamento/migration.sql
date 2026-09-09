-- CreateEnum
CREATE TYPE "TipoMovimentoTravamento" AS ENUM ('TRAVAR', 'DESTRAVAR');

-- CreateTable
CREATE TABLE "MovimentoTravamento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoTravamento" NOT NULL,
    "janelaInicio" TIMESTAMP(3) NOT NULL,
    "janelaFim" TIMESTAMP(3) NOT NULL,
    "usuarioAlvo" TEXT,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoTravamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimentoTravamento_usuarioAlvo_idx" ON "MovimentoTravamento"("usuarioAlvo");

-- CreateIndex
CREATE INDEX "MovimentoTravamento_janelaInicio_janelaFim_idx" ON "MovimentoTravamento"("janelaInicio", "janelaFim");
