-- CreateEnum
CREATE TYPE "CadastroComCamposAdicionais" AS ENUM ('PESSOA', 'PROCESSO', 'COMUNICADO');

-- CreateEnum
CREATE TYPE "TipoDeCampoAdicional" AS ENUM ('VALOR', 'LISTA', 'ALFANUMERICO', 'DATA', 'LISTA_DINAMICA', 'HORA', 'BOOLEANO');

-- CreateTable
CREATE TABLE "DefinicaoDeCampoAdicional" (
    "id" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "cadastro" "CadastroComCamposAdicionais" NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tipo" "TipoDeCampoAdicional" NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "origemDinamica" VARCHAR(30),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DefinicaoDeCampoAdicional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcaoDeCampoAdicional" (
    "id" TEXT NOT NULL,
    "definicaoId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "OpcaoDeCampoAdicional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValorDeCampoAdicional" (
    "id" TEXT NOT NULL,
    "definicaoId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "processoId" TEXT,
    "comunicadoId" TEXT,
    "valorTexto" TEXT,
    "valorNumero" DECIMAL(18,2),
    "valorData" TIMESTAMP(3),
    "valorBooleano" BOOLEAN,
    "apagado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ValorDeCampoAdicional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefinicaoDeCampoAdicional_unidadeOrcId_cadastro_ativo_idx" ON "DefinicaoDeCampoAdicional"("unidadeOrcId", "cadastro", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "DefinicaoDeCampoAdicional_unidadeOrcId_cadastro_codigo_key" ON "DefinicaoDeCampoAdicional"("unidadeOrcId", "cadastro", "codigo");

-- CreateIndex
CREATE INDEX "OpcaoDeCampoAdicional_definicaoId_idx" ON "OpcaoDeCampoAdicional"("definicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "OpcaoDeCampoAdicional_definicaoId_valor_key" ON "OpcaoDeCampoAdicional"("definicaoId", "valor");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_definicaoId_criadoEm_idx" ON "ValorDeCampoAdicional"("definicaoId", "criadoEm");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_pessoaId_idx" ON "ValorDeCampoAdicional"("pessoaId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_processoId_idx" ON "ValorDeCampoAdicional"("processoId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_comunicadoId_idx" ON "ValorDeCampoAdicional"("comunicadoId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_valorTexto_idx" ON "ValorDeCampoAdicional"("valorTexto");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_valorNumero_idx" ON "ValorDeCampoAdicional"("valorNumero");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_valorData_idx" ON "ValorDeCampoAdicional"("valorData");

-- AddForeignKey
ALTER TABLE "DefinicaoDeCampoAdicional" ADD CONSTRAINT "DefinicaoDeCampoAdicional_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcaoDeCampoAdicional" ADD CONSTRAINT "OpcaoDeCampoAdicional_definicaoId_fkey" FOREIGN KEY ("definicaoId") REFERENCES "DefinicaoDeCampoAdicional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_definicaoId_fkey" FOREIGN KEY ("definicaoId") REFERENCES "DefinicaoDeCampoAdicional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

