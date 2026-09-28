-- V22 — a campanha publicitária e o vínculo do empenho com ela. Aditiva: uma tabela nova e uma
-- coluna opcional no Empenho, sem backfill.

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "campanhaPublicitariaId" TEXT;

-- CreateTable
CREATE TABLE "CampanhaPublicitaria" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "contratoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CampanhaPublicitaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampanhaPublicitaria_identificador_key" ON "CampanhaPublicitaria"("identificador");

-- CreateIndex
CREATE INDEX "CampanhaPublicitaria_contratoId_idx" ON "CampanhaPublicitaria"("contratoId");

-- AddForeignKey
ALTER TABLE "CampanhaPublicitaria" ADD CONSTRAINT "CampanhaPublicitaria_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_campanhaPublicitariaId_fkey" FOREIGN KEY ("campanhaPublicitariaId") REFERENCES "CampanhaPublicitaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

