-- AlterTable
ALTER TABLE "Acao" ADD COLUMN     "tipoManad" VARCHAR(2);

-- AlterTable
ALTER TABLE "EnteConfig" ADD COLUMN     "cei" VARCHAR(12),
ADD COLUMN     "cnpj" VARCHAR(14),
ADD COLUMN     "cpf" VARCHAR(11),
ADD COLUMN     "indCentralizacao" VARCHAR(1),
ADD COLUMN     "inscricaoEstadual" TEXT,
ADD COLUMN     "inscricaoMunicipal" TEXT,
ADD COLUMN     "nit" VARCHAR(11),
ADD COLUMN     "suframa" VARCHAR(9),
ADD COLUMN     "uf" VARCHAR(2);

-- AlterTable
ALTER TABLE "NaturezaDespesa" ADD COLUMN     "indTipoContaManad" VARCHAR(1),
ADD COLUMN     "nivelContaManad" INTEGER;

-- AlterTable
ALTER TABLE "NaturezaReceita" ADD COLUMN     "indTipoContaManad" VARCHAR(1),
ADD COLUMN     "nivelContaManad" INTEGER;

-- AlterTable
ALTER TABLE "UnidadeOrcamentaria" ADD COLUMN     "cnpjManad" VARCHAR(14),
ADD COLUMN     "tipoManad" VARCHAR(2);

-- CreateTable
CREATE TABLE "ManadContabilista" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpjEscritorio" VARCHAR(14),
    "cpf" VARCHAR(11) NOT NULL,
    "crc" VARCHAR(11) NOT NULL,
    "dtInicio" TIMESTAMP(3) NOT NULL,
    "dtFim" TIMESTAMP(3),
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cep" VARCHAR(8),
    "uf" VARCHAR(2),
    "caixaPostal" TEXT,
    "cepCaixaPostal" VARCHAR(8),
    "fone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "conferidoPor" TEXT NOT NULL,
    "conferidoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManadContabilista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManadEmpresaGeradora" (
    "id" TEXT NOT NULL,
    "empresaOuTecnico" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "dtInicioServico" TIMESTAMP(3) NOT NULL,
    "dtFimServico" TIMESTAMP(3),
    "cnpj" VARCHAR(14),
    "cpf" VARCHAR(11),
    "fone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "conferidoPor" TEXT NOT NULL,
    "conferidoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManadEmpresaGeradora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManadContabilista_dtInicio_idx" ON "ManadContabilista"("dtInicio");

-- CreateIndex
CREATE INDEX "ManadEmpresaGeradora_dtInicioServico_idx" ON "ManadEmpresaGeradora"("dtInicioServico");
