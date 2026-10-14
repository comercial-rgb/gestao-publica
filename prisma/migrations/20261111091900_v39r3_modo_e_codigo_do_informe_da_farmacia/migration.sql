-- CreateEnum
CREATE TYPE "ModoDoInformeDaFarmacia" AS ENUM ('IMPORTADO', 'CALCULADO');


-- CreateTable
CREATE TABLE "ModoDoInformeAdotado" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "modo" "ModoDoInformeDaFarmacia" NOT NULL,
    "desdeAno" INTEGER NOT NULL,
    "desdeMes" INTEGER NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ModoDoInformeAdotado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoDoMaterialNoInforme" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "codigoProduto" VARCHAR(14) NOT NULL,
    "descricao" VARCHAR(60) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CodigoDoMaterialNoInforme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModoDoInformeAdotado_farmaciaId_desdeAno_desdeMes_key" ON "ModoDoInformeAdotado"("farmaciaId", "desdeAno", "desdeMes");

-- CreateIndex
CREATE INDEX "CodigoDoMaterialNoInforme_materialId_criadoEm_idx" ON "CodigoDoMaterialNoInforme"("materialId", "criadoEm");

-- AddForeignKey
ALTER TABLE "ModoDoInformeAdotado" ADD CONSTRAINT "ModoDoInformeAdotado_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoDoMaterialNoInforme" ADD CONSTRAINT "CodigoDoMaterialNoInforme_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

