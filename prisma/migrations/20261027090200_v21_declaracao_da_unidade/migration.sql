-- V21 — a declaração VERSIONADA da unidade orçamentária (natureza jurídica, secretário, ato de
-- nomeação). Aditiva e append-only: não entra no censo de escrita mutável do papel de runtime.

-- CreateEnum
CREATE TYPE "NaturezaJuridicaDaUnidade" AS ENUM ('CAMARA_MUNICIPAL', 'PREFEITURA_OU_SECRETARIA', 'AUTARQUIA', 'FUNDACAO', 'SOCIEDADE_DE_ECONOMIA_MISTA', 'FUNDO', 'EMPRESA_PUBLICA', 'AUTARQUIA_PREVIDENCIARIA', 'FUNDO_PREVIDENCIARIO');

-- CreateEnum
CREATE TYPE "AtoDeNomeacao" AS ENUM ('LEI', 'DECRETO', 'PORTARIA', 'OUTROS');

-- CreateTable
CREATE TABLE "DeclaracaoDaUnidadeOrcamentaria" (
    "id" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "naturezaJuridica" "NaturezaJuridicaDaUnidade" NOT NULL,
    "nomeSecretario" VARCHAR(60) NOT NULL,
    "cpfSecretario" VARCHAR(11) NOT NULL,
    "atoDeNomeacao" "AtoDeNomeacao" NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeclaracaoDaUnidadeOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeclaracaoDaUnidadeOrcamentaria_unidadeOrcId_vigenteDesde_idx" ON "DeclaracaoDaUnidadeOrcamentaria"("unidadeOrcId", "vigenteDesde");

ALTER TABLE "DeclaracaoDaUnidadeOrcamentaria" ADD CONSTRAINT "DeclaracaoDaUnidadeOrcamentaria_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

