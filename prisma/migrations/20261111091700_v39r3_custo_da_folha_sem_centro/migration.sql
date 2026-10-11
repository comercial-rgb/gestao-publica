-- CreateTable
CREATE TABLE "ParcelaSemCentroDeCusto" (
    "id" TEXT NOT NULL,
    "apropriacaoId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ParcelaSemCentroDeCusto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParcelaSemCentroDeCusto_vinculoId_idx" ON "ParcelaSemCentroDeCusto"("vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelaSemCentroDeCusto_apropriacaoId_vinculoId_key" ON "ParcelaSemCentroDeCusto"("apropriacaoId", "vinculoId");

-- AddForeignKey
ALTER TABLE "ParcelaSemCentroDeCusto" ADD CONSTRAINT "ParcelaSemCentroDeCusto_apropriacaoId_fkey" FOREIGN KEY ("apropriacaoId") REFERENCES "ApropriacaoDeCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaSemCentroDeCusto" ADD CONSTRAINT "ParcelaSemCentroDeCusto_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

