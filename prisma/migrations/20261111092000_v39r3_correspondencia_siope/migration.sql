-- CreateEnum
CREATE TYPE "GrupoDaSubfuncaoNoSiope" AS ENUM ('TIPICA_DA_EDUCACAO', 'APOIO_ADMINISTRATIVO', 'OUTRA_CONSIDERADA', 'OUTRA_NAO_CONSIDERADA');

-- CreateEnum
CREATE TYPE "TratamentoNoSiope" AS ENUM ('CONSIDERADA', 'CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL', 'CONSIDERADA_SE_RECURSOS_PROPRIOS', 'NAO_CONSIDERADA');

-- CreateEnum
CREATE TYPE "SecaoDoManualSiope" AS ENUM ('TIPICAS_MUNICIPAIS', 'QUADRO_18', 'QUADRO_19', 'QUADRO_20');

-- CreateTable
CREATE TABLE "CorrespondenciaSiope" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "fonte" TEXT NOT NULL,
    "shaDoTexto" VARCHAR(64) NOT NULL,
    "shaDaTranscricao" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CorrespondenciaSiope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaCorrespondenciaSiope" (
    "id" TEXT NOT NULL,
    "correspondenciaId" TEXT NOT NULL,
    "subfuncaoCodigo" VARCHAR(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" "GrupoDaSubfuncaoNoSiope" NOT NULL,
    "tratamento" "TratamentoNoSiope" NOT NULL,
    "secao" "SecaoDoManualSiope" NOT NULL,
    "linhaNoManual" INTEGER NOT NULL,

    CONSTRAINT "ItemDaCorrespondenciaSiope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorrespondenciaSiope_exercicio_versao_key" ON "CorrespondenciaSiope"("exercicio", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "CorrespondenciaSiope_exercicio_shaDoTexto_shaDaTranscricao_key" ON "CorrespondenciaSiope"("exercicio", "shaDoTexto", "shaDaTranscricao");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaCorrespondenciaSiope_correspondenciaId_subfuncaoCodig_key" ON "ItemDaCorrespondenciaSiope"("correspondenciaId", "subfuncaoCodigo");

-- AddForeignKey
ALTER TABLE "ItemDaCorrespondenciaSiope" ADD CONSTRAINT "ItemDaCorrespondenciaSiope_correspondenciaId_fkey" FOREIGN KEY ("correspondenciaId") REFERENCES "CorrespondenciaSiope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

