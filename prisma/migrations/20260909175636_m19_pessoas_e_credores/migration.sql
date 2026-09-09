-- CreateEnum
CREATE TYPE "TipoDePessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "PapelDePessoa" AS ENUM ('CREDOR', 'CONSIGNATARIO', 'SERVIDOR', 'REPRESENTANTE');

-- CreateEnum
CREATE TYPE "MovimentoDePapel" AS ENUM ('CONCEDIDO', 'ENCERRADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_PESSOA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ALTERAR_PESSOA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'MOVER_PAPEL_DE_PESSOA';

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" TEXT NOT NULL,
    "documento" VARCHAR(14) NOT NULL,
    "tipo" "TipoDePessoa" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDePessoa" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" VARCHAR(2),
    "cep" VARCHAR(8),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDePessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDePapelDaPessoa" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "papel" "PapelDePessoa" NOT NULL,
    "movimento" "MovimentoDePapel" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDePapelDaPessoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_documento_key" ON "Pessoa"("documento");

-- CreateIndex
CREATE INDEX "Pessoa_tipo_idx" ON "Pessoa"("tipo");

-- CreateIndex
CREATE INDEX "VersaoDePessoa_pessoaId_criadoEm_idx" ON "VersaoDePessoa"("pessoaId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoDePapelDaPessoa_pessoaId_papel_data_idx" ON "MovimentoDePapelDaPessoa"("pessoaId", "papel", "data");

-- CreateIndex
CREATE INDEX "MovimentoDePapelDaPessoa_papel_idx" ON "MovimentoDePapelDaPessoa"("papel");

-- AddForeignKey
ALTER TABLE "VersaoDePessoa" ADD CONSTRAINT "VersaoDePessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDePapelDaPessoa" ADD CONSTRAINT "MovimentoDePapelDaPessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
