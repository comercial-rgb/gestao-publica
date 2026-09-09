-- CreateEnum
CREATE TYPE "AnexoDemonstrativo" AS ENUM ('ANEXO_14', 'ANEXO_15');

-- CreateEnum
CREATE TYPE "GrupoBalanco" AS ENUM ('ATIVO_CIRCULANTE', 'ATIVO_NAO_CIRCULANTE', 'PASSIVO_CIRCULANTE', 'PASSIVO_NAO_CIRCULANTE', 'PATRIMONIO_LIQUIDO');

-- CreateTable
CREATE TABLE "LinhaDemonstrativo" (
    "id" TEXT NOT NULL,
    "anexo" "AnexoDemonstrativo" NOT NULL,
    "codigoLinha" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "grupo" "GrupoBalanco" NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LinhaDemonstrativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrefixoDaLinha" (
    "id" TEXT NOT NULL,
    "linhaId" TEXT NOT NULL,
    "prefixoConta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PrefixoDaLinha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinhaDemonstrativo_anexo_grupo_ordem_idx" ON "LinhaDemonstrativo"("anexo", "grupo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaDemonstrativo_anexo_codigoLinha_key" ON "LinhaDemonstrativo"("anexo", "codigoLinha");

-- CreateIndex
CREATE INDEX "PrefixoDaLinha_linhaId_idx" ON "PrefixoDaLinha"("linhaId");

-- CreateIndex
CREATE INDEX "PrefixoDaLinha_prefixoConta_idx" ON "PrefixoDaLinha"("prefixoConta");

-- AddForeignKey
ALTER TABLE "PrefixoDaLinha" ADD CONSTRAINT "PrefixoDaLinha_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaDemonstrativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
