-- V39-R3 (R3-012, M10) — a recontagem do inventario do almoxarifado guarda o numero anterior e quem recontou.
-- Aditiva: uma tabela nova, append-only.
-- CreateTable
CREATE TABLE "RecontagemDeInventario" (
    "id" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "quantidadeAnterior" DECIMAL(18,4) NOT NULL,
    "quantidadeNova" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RecontagemDeInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecontagemDeInventario_contagemId_idx" ON "RecontagemDeInventario"("contagemId");

-- AddForeignKey
ALTER TABLE "RecontagemDeInventario" ADD CONSTRAINT "RecontagemDeInventario_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "ContagemDeInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

