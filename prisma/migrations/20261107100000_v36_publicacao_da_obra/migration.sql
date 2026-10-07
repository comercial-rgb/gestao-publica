-- V36 — a obra no portal da transparência (TR 5.10.1.54). Aditiva: uma tabela nova, append-only.

-- CreateTable
CREATE TABLE "PublicacaoDaObra" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "publicada" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PublicacaoDaObra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicacaoDaObra_obraId_criadoEm_idx" ON "PublicacaoDaObra"("obraId", "criadoEm");

-- AddForeignKey
ALTER TABLE "PublicacaoDaObra" ADD CONSTRAINT "PublicacaoDaObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
