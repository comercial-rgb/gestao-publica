-- AlterTable
ALTER TABLE "Orgao" ALTER COLUMN "codigo" SET DATA TYPE VARCHAR(2);

-- CreateTable
CREATE TABLE "TipoReceitaSagres" (
    "id" TEXT NOT NULL,
    "tipoInterno" "TipoReceita" NOT NULL,
    "codigoSagres" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "TipoReceitaSagres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoReceitaSagres_tipoInterno_key" ON "TipoReceitaSagres"("tipoInterno");

-- CreateIndex
CREATE UNIQUE INDEX "TipoReceitaSagres_codigoSagres_key" ON "TipoReceitaSagres"("codigoSagres");
