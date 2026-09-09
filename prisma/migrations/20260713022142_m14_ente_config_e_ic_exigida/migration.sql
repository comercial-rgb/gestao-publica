-- CreateTable
CREATE TABLE "EnteConfig" (
    "id" TEXT NOT NULL,
    "codigoIbge" VARCHAR(7) NOT NULL,
    "poderOrgao" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "conferidoPor" TEXT NOT NULL,
    "conferidoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcExigidaPorConta" (
    "id" TEXT NOT NULL,
    "prefixoConta" TEXT NOT NULL,
    "ic" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "IcExigidaPorConta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IcExigidaPorConta_prefixoConta_idx" ON "IcExigidaPorConta"("prefixoConta");

-- CreateIndex
CREATE UNIQUE INDEX "IcExigidaPorConta_prefixoConta_ic_key" ON "IcExigidaPorConta"("prefixoConta", "ic");
