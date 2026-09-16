-- V7 B1 — o cadastro imobiliário histórico, os vínculos com a Pessoa canônica e as tabelas de parâmetros do
-- tributo. Aditiva: sete tabelas e três enums novos, nenhum DROP. Simular não grava nada: não há tabela de simulação.

-- CreateEnum
CREATE TYPE "UsoDoImovel" AS ENUM ('RESIDENCIAL', 'COMERCIAL', 'INDUSTRIAL', 'TERRITORIAL', 'MISTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "PapelNoImovel" AS ENUM ('PROPRIETARIO', 'COMPROMISSARIO', 'POSSUIDOR', 'RESPONSAVEL_TRIBUTARIO');

-- CreateEnum
CREATE TYPE "TributoMunicipal" AS ENUM ('IPTU', 'ITBI', 'ISS', 'TAXA');

-- CreateTable
CREATE TABLE "Imovel" (
    "id" TEXT NOT NULL,
    "inscricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Imovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoImovel" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "zona" TEXT,
    "uso" "UsoDoImovel" NOT NULL,
    "padraoConstrutivo" TEXT,
    "areaDoTerreno" DECIMAL(18,4) NOT NULL,
    "areaConstruida" DECIMAL(18,4) NOT NULL,
    "fracaoIdeal" DECIMAL(9,6),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoImovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtributoDaVersaoDoImovel" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "AtributoDaVersaoDoImovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoDePessoaComImovel" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "papel" "PapelNoImovel" NOT NULL,
    "fracao" DECIMAL(9,6) NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VinculoDePessoaComImovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncerramentoDoVinculoComImovel" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EncerramentoDoVinculoComImovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaDeParametrosTributarios" (
    "id" TEXT NOT NULL,
    "tributo" "TributoMunicipal" NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TabelaDeParametrosTributarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroTributario" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "ParametroTributario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Imovel_inscricao_key" ON "Imovel"("inscricao");

-- CreateIndex
CREATE INDEX "VersaoDoImovel_imovelId_vigenciaInicio_idx" ON "VersaoDoImovel"("imovelId", "vigenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoImovel_imovelId_versao_key" ON "VersaoDoImovel"("imovelId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "AtributoDaVersaoDoImovel_versaoId_chave_key" ON "AtributoDaVersaoDoImovel"("versaoId", "chave");

-- CreateIndex
CREATE INDEX "VinculoDePessoaComImovel_imovelId_papel_idx" ON "VinculoDePessoaComImovel"("imovelId", "papel");

-- CreateIndex
CREATE INDEX "VinculoDePessoaComImovel_pessoaId_idx" ON "VinculoDePessoaComImovel"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "EncerramentoDoVinculoComImovel_vinculoId_key" ON "EncerramentoDoVinculoComImovel"("vinculoId");

-- CreateIndex
CREATE INDEX "TabelaDeParametrosTributarios_tributo_exercicio_vigenciaIni_idx" ON "TabelaDeParametrosTributarios"("tributo", "exercicio", "vigenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "TabelaDeParametrosTributarios_tributo_exercicio_versao_key" ON "TabelaDeParametrosTributarios"("tributo", "exercicio", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroTributario_tabelaId_chave_key" ON "ParametroTributario"("tabelaId", "chave");

-- AddForeignKey
ALTER TABLE "VersaoDoImovel" ADD CONSTRAINT "VersaoDoImovel_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtributoDaVersaoDoImovel" ADD CONSTRAINT "AtributoDaVersaoDoImovel_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoImovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoDePessoaComImovel" ADD CONSTRAINT "VinculoDePessoaComImovel_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoDePessoaComImovel" ADD CONSTRAINT "VinculoDePessoaComImovel_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncerramentoDoVinculoComImovel" ADD CONSTRAINT "EncerramentoDoVinculoComImovel_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "VinculoDePessoaComImovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroTributario" ADD CONSTRAINT "ParametroTributario_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "TabelaDeParametrosTributarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks que o Prisma não representa (a regra continua no caso de uso; o banco recusa a linha impossível).
ALTER TABLE "VersaoDoImovel" ADD CONSTRAINT "ck_versao_do_imovel_areas" CHECK ("areaDoTerreno" >= 0 AND "areaConstruida" >= 0 AND ("fracaoIdeal" IS NULL OR ("fracaoIdeal" > 0 AND "fracaoIdeal" <= 1)));
ALTER TABLE "VersaoDoImovel" ADD CONSTRAINT "ck_versao_do_imovel_positiva" CHECK ("versao" >= 1);
ALTER TABLE "VinculoDePessoaComImovel" ADD CONSTRAINT "ck_vinculo_imovel_fracao" CHECK ("fracao" > 0 AND "fracao" <= 1);
ALTER TABLE "TabelaDeParametrosTributarios" ADD CONSTRAINT "ck_tabela_tributaria_versao" CHECK ("versao" >= 1);
ALTER TABLE "TabelaDeParametrosTributarios" ADD CONSTRAINT "ck_tabela_tributaria_formula" CHECK (char_length(btrim("formula")) >= 1);
