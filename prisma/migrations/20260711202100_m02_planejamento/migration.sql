-- CreateEnum
CREATE TYPE "TipoAcao" AS ENUM ('PROJETO', 'ATIVIDADE', 'OPERACAO_ESPECIAL');

-- CreateEnum
CREATE TYPE "TipoReceita" AS ENUM ('ORCAMENTARIA', 'INTRA_ORCAMENTARIA', 'DEDUCAO');

-- AlterTable
ALTER TABLE "PartidaContabil" ADD COLUMN     "fichaId" TEXT;

-- CreateTable
CREATE TABLE "Orgao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Orgao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadeOrcamentaria" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(5) NOT NULL,
    "descricao" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,

    CONSTRAINT "UnidadeOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(2) NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Funcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subfuncao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(3) NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Subfuncao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programa" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "descricao" TEXT NOT NULL,
    "objetivo" TEXT,
    "tipoObjetivoMilenio" TEXT,

    CONSTRAINT "Programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoAcao" NOT NULL,

    CONSTRAINT "Acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NaturezaDespesa" (
    "id" TEXT NOT NULL,
    "codCategoria" VARCHAR(1) NOT NULL,
    "codNatureza" VARCHAR(1) NOT NULL,
    "codModalidade" VARCHAR(2) NOT NULL,
    "codElemento" VARCHAR(2) NOT NULL,
    "codigoCompleto" VARCHAR(6) NOT NULL,
    "descricao" TEXT NOT NULL,
    "mapeamentoStn" TEXT,

    CONSTRAINT "NaturezaDespesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subelemento" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "naturezaId" TEXT NOT NULL,

    CONSTRAINT "Subelemento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonteRecurso" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "codigoTce" TEXT NOT NULL,
    "codigoStn" TEXT,
    "exercicioPadrao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FonteRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoAcompanhamento" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "CodigoAcompanhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaOrcamentaria" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "subfuncaoId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "naturezaDespesaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "coId" TEXT,
    "exercicioFonte" INTEGER NOT NULL DEFAULT 1,
    "valorDotado" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "FichaOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NaturezaReceita" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(8) NOT NULL,
    "descricao" TEXT NOT NULL,
    "mapeamentoStn" TEXT,

    CONSTRAINT "NaturezaReceita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaPrevista" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "exercicioFonte" INTEGER NOT NULL DEFAULT 1,
    "tipoReceita" "TipoReceita" NOT NULL,
    "valorPrevisto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ReceitaPrevista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Orgao_codigo_key" ON "Orgao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeOrcamentaria_codigo_key" ON "UnidadeOrcamentaria"("codigo");

-- CreateIndex
CREATE INDEX "UnidadeOrcamentaria_orgaoId_idx" ON "UnidadeOrcamentaria"("orgaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Funcao_codigo_key" ON "Funcao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Subfuncao_codigo_key" ON "Subfuncao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Programa_codigo_key" ON "Programa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Acao_codigo_key" ON "Acao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "NaturezaDespesa_codigoCompleto_key" ON "NaturezaDespesa"("codigoCompleto");

-- CreateIndex
CREATE UNIQUE INDEX "NaturezaDespesa_codCategoria_codNatureza_codModalidade_codE_key" ON "NaturezaDespesa"("codCategoria", "codNatureza", "codModalidade", "codElemento");

-- CreateIndex
CREATE INDEX "Subelemento_naturezaId_idx" ON "Subelemento"("naturezaId");

-- CreateIndex
CREATE UNIQUE INDEX "Subelemento_naturezaId_codigo_key" ON "Subelemento"("naturezaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "FonteRecurso_codigo_key" ON "FonteRecurso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoAcompanhamento_codigo_key" ON "CodigoAcompanhamento"("codigo");

-- CreateIndex
CREATE INDEX "FichaOrcamentaria_exercicio_idx" ON "FichaOrcamentaria"("exercicio");

-- CreateIndex
CREATE INDEX "FichaOrcamentaria_orgaoId_idx" ON "FichaOrcamentaria"("orgaoId");

-- CreateIndex
CREATE INDEX "FichaOrcamentaria_unidadeOrcId_idx" ON "FichaOrcamentaria"("unidadeOrcId");

-- CreateIndex
CREATE INDEX "FichaOrcamentaria_fonteId_idx" ON "FichaOrcamentaria"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaOrcamentaria_exercicio_numero_key" ON "FichaOrcamentaria"("exercicio", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "FichaOrcamentaria_exercicio_unidadeOrcId_funcaoId_subfuncao_key" ON "FichaOrcamentaria"("exercicio", "unidadeOrcId", "funcaoId", "subfuncaoId", "programaId", "acaoId", "naturezaDespesaId", "exercicioFonte", "fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "NaturezaReceita_codigo_key" ON "NaturezaReceita"("codigo");

-- CreateIndex
CREATE INDEX "ReceitaPrevista_exercicio_idx" ON "ReceitaPrevista"("exercicio");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaPrevista_exercicio_naturezaReceitaId_exercicioFonte__key" ON "ReceitaPrevista"("exercicio", "naturezaReceitaId", "exercicioFonte", "fonteId", "tipoReceita");

-- CreateIndex
CREATE INDEX "PartidaContabil_fichaId_idx" ON "PartidaContabil"("fichaId");

-- AddForeignKey
ALTER TABLE "PartidaContabil" ADD CONSTRAINT "PartidaContabil_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeOrcamentaria" ADD CONSTRAINT "UnidadeOrcamentaria_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subelemento" ADD CONSTRAINT "Subelemento_naturezaId_fkey" FOREIGN KEY ("naturezaId") REFERENCES "NaturezaDespesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "Funcao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_subfuncaoId_fkey" FOREIGN KEY ("subfuncaoId") REFERENCES "Subfuncao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_naturezaDespesaId_fkey" FOREIGN KEY ("naturezaDespesaId") REFERENCES "NaturezaDespesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaOrcamentaria" ADD CONSTRAINT "FichaOrcamentaria_coId_fkey" FOREIGN KEY ("coId") REFERENCES "CodigoAcompanhamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
