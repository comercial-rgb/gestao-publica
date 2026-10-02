-- V26 (ordem, item 2.1) — as versões do projeto da LOA encaminhado à Câmara, com a cópia imutável dos valores. Aditiva.

-- CreateEnum
CREATE TYPE "TipoDaVersaoDoProjetoDaLoa" AS ENUM ('ENCAMINHADO', 'MENSAGEM_MODIFICATIVA', 'EMENDADO_NA_CAMARA');

-- CreateTable
CREATE TABLE "VersaoDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "leiId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoDaVersaoDoProjetoDaLoa" NOT NULL,
    "dataDoEncaminhamento" TIMESTAMP(3) NOT NULL,
    "competenciaDaRemessa" VARCHAR(7) NOT NULL,
    "documento" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DotacaoDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codUnidadeOrcamentaria" VARCHAR(5) NOT NULL,
    "codFuncao" VARCHAR(2) NOT NULL,
    "codSubfuncao" VARCHAR(3) NOT NULL,
    "codPrograma" VARCHAR(4) NOT NULL,
    "codAcao" VARCHAR(4) NOT NULL,
    "codCategoria" VARCHAR(1) NOT NULL,
    "codNatureza" VARCHAR(1) NOT NULL,
    "codModalidade" VARCHAR(2) NOT NULL,
    "codElemento" VARCHAR(2) NOT NULL,
    "exercicioFonte" INTEGER NOT NULL,
    "codFonte" VARCHAR(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "DotacaoDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codNatureza" VARCHAR(8) NOT NULL,
    "exercicioFonte" INTEGER NOT NULL,
    "codFonte" VARCHAR(3) NOT NULL,
    "tipoReceita" "TipoReceita" NOT NULL,
    "tipoDeducaoSagres" VARCHAR(1),
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ReceitaDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramaDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "descricao" VARCHAR(70) NOT NULL,
    "objetivo" VARCHAR(150) NOT NULL,
    "tipoObjetivoMilenio" VARCHAR(2) NOT NULL,

    CONSTRAINT "ProgramaDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcaoDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "descricao" VARCHAR(70) NOT NULL,
    "tipo" "TipoAcao" NOT NULL,
    "descMeta" VARCHAR(150) NOT NULL,
    "unidadeMedida" VARCHAR(50) NOT NULL,

    CONSTRAINT "AcaoDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadeDoProjetoDaLoa" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codigo" VARCHAR(5) NOT NULL,
    "descricao" VARCHAR(50) NOT NULL,
    "nomeSecretario" VARCHAR(60) NOT NULL,
    "cpfSecretario" VARCHAR(11) NOT NULL,
    "atoDeNomeacao" "AtoDeNomeacao" NOT NULL,

    CONSTRAINT "UnidadeDoProjetoDaLoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoProjetoDaLoa_leiId_numero_key" ON "VersaoDoProjetoDaLoa"("leiId", "numero");

-- CreateIndex
CREATE INDEX "DotacaoDoProjetoDaLoa_versaoId_idx" ON "DotacaoDoProjetoDaLoa"("versaoId");

-- CreateIndex
CREATE INDEX "ReceitaDoProjetoDaLoa_versaoId_idx" ON "ReceitaDoProjetoDaLoa"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaDoProjetoDaLoa_versaoId_codigo_key" ON "ProgramaDoProjetoDaLoa"("versaoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AcaoDoProjetoDaLoa_versaoId_codigo_key" ON "AcaoDoProjetoDaLoa"("versaoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeDoProjetoDaLoa_versaoId_codigo_key" ON "UnidadeDoProjetoDaLoa"("versaoId", "codigo");

-- AddForeignKey
ALTER TABLE "VersaoDoProjetoDaLoa" ADD CONSTRAINT "VersaoDoProjetoDaLoa_leiId_fkey" FOREIGN KEY ("leiId") REFERENCES "LeiOrcamentariaAnual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DotacaoDoProjetoDaLoa" ADD CONSTRAINT "DotacaoDoProjetoDaLoa_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoProjetoDaLoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaDoProjetoDaLoa" ADD CONSTRAINT "ReceitaDoProjetoDaLoa_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoProjetoDaLoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramaDoProjetoDaLoa" ADD CONSTRAINT "ProgramaDoProjetoDaLoa_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoProjetoDaLoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoDoProjetoDaLoa" ADD CONSTRAINT "AcaoDoProjetoDaLoa_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoProjetoDaLoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeDoProjetoDaLoa" ADD CONSTRAINT "UnidadeDoProjetoDaLoa_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoProjetoDaLoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A remessa é um mês (AAAA-MM); a versão começa em 1; valores não negativos; CPF com 11 dígitos.
ALTER TABLE "VersaoDoProjetoDaLoa" ADD CONSTRAINT "VersaoDoProjetoDaLoa_remessa_check" CHECK ("competenciaDaRemessa" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "numero" >= 1);
ALTER TABLE "DotacaoDoProjetoDaLoa" ADD CONSTRAINT "DotacaoDoProjetoDaLoa_valor_check" CHECK ("valor" >= 0);
ALTER TABLE "ReceitaDoProjetoDaLoa" ADD CONSTRAINT "ReceitaDoProjetoDaLoa_valor_check" CHECK ("valor" >= 0 AND ("tipoDeducaoSagres" IS NULL OR "tipoDeducaoSagres" IN ('3','4','5')));
ALTER TABLE "UnidadeDoProjetoDaLoa" ADD CONSTRAINT "UnidadeDoProjetoDaLoa_cpf_check" CHECK ("cpfSecretario" ~ '^[0-9]{11}$');
