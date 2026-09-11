-- CreateEnum
CREATE TYPE "FinalidadeDeComissao" AS ENUM ('INVENTARIO', 'REAVALIACAO', 'DEPRECIACAO', 'BAIXA');

-- CreateEnum
CREATE TYPE "EstadoDeConservacao" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'INSERVIVEL');

-- CreateEnum
CREATE TYPE "SituacaoFisicaDoBem" AS ENUM ('EM_USO', 'EM_EMPRESTIMO', 'EM_LOCACAO', 'EM_MANUTENCAO_PREVENTIVA', 'EM_MANUTENCAO_CORRETIVA', 'EM_DESUSO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoDeGestao" AS ENUM ('LOCALIZACAO', 'RESPONSAVEL', 'ESTADO', 'SITUACAO', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'ESTORNO_LOCALIZACAO', 'ESTORNO_RESPONSAVEL', 'ESTORNO_ESTADO', 'ESTORNO_SITUACAO', 'ESTORNO_TRANSFERENCIA_SAIDA', 'ESTORNO_TRANSFERENCIA_ENTRADA');

-- CreateEnum
CREATE TYPE "TipoDeTermoPatrimonial" AS ENUM ('RESPONSABILIDADE', 'BAIXA');

-- AlterTable
ALTER TABLE "BemPatrimonial" ADD COLUMN     "codigoDeBarras" VARCHAR(60),
ADD COLUMN     "tipoDeIncorporacaoId" TEXT;

-- CreateTable
CREATE TABLE "LocalizacaoFisica" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "paiId" TEXT,
    "setorId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LocalizacaoFisica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoPatrimonial" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "finalidade" "FinalidadeDeComissao" NOT NULL,
    "atoDesignacao" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ComissaoPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroDeComissaoPatrimonial" (
    "id" TEXT NOT NULL,
    "comissaoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "atribuicao" TEXT NOT NULL,
    "presidente" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MembroDeComissaoPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDeGestaoDoBem" (
    "id" TEXT NOT NULL,
    "bemId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDeGestao" NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "localizacaoId" TEXT,
    "responsavelId" TEXT,
    "estado" "EstadoDeConservacao",
    "situacao" "SituacaoFisicaDoBem",
    "unidadeOrcId" TEXT,
    "inventarioId" TEXT,
    "operacaoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDeGestaoDoBem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioDeBens" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "comissaoId" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "dataAbertura" TIMESTAMP(3) NOT NULL,
    "dataFechamento" TIMESTAMP(3),
    "termoAberturaId" TEXT,
    "termoFechamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "InventarioDeBens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContagemDeBem" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "bemId" TEXT NOT NULL,
    "encontrado" BOOLEAN NOT NULL,
    "localizacaoObservadaId" TEXT,
    "estadoObservado" "EstadoDeConservacao",
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContagemDeBem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermoPatrimonial" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "tipo" "TipoDeTermoPatrimonial" NOT NULL,
    "responsavelId" TEXT,
    "setorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "documentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TermoPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeTermoPatrimonial" (
    "id" TEXT NOT NULL,
    "termoId" TEXT NOT NULL,
    "bemId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeTermoPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotivoDeBaixa" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MotivoDeBaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDeIncorporacao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TipoDeIncorporacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaDeAvaliacao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "expressao" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FormulaDeAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalizacaoFisica_codigo_key" ON "LocalizacaoFisica"("codigo");

-- CreateIndex
CREATE INDEX "LocalizacaoFisica_paiId_idx" ON "LocalizacaoFisica"("paiId");

-- CreateIndex
CREATE INDEX "LocalizacaoFisica_setorId_idx" ON "LocalizacaoFisica"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoPatrimonial_codigo_key" ON "ComissaoPatrimonial"("codigo");

-- CreateIndex
CREATE INDEX "ComissaoPatrimonial_finalidade_vigenciaInicio_idx" ON "ComissaoPatrimonial"("finalidade", "vigenciaInicio");

-- CreateIndex
CREATE INDEX "MembroDeComissaoPatrimonial_pessoaId_idx" ON "MembroDeComissaoPatrimonial"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "MembroDeComissaoPatrimonial_comissaoId_pessoaId_key" ON "MembroDeComissaoPatrimonial"("comissaoId", "pessoaId");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_bemId_tipo_dataMovimento_idx" ON "MovimentoDeGestaoDoBem"("bemId", "tipo", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_localizacaoId_idx" ON "MovimentoDeGestaoDoBem"("localizacaoId");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_responsavelId_idx" ON "MovimentoDeGestaoDoBem"("responsavelId");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_inventarioId_idx" ON "MovimentoDeGestaoDoBem"("inventarioId");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_estornoDeId_idx" ON "MovimentoDeGestaoDoBem"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoDeGestaoDoBem_operacaoId_idx" ON "MovimentoDeGestaoDoBem"("operacaoId");

-- CreateIndex
CREATE INDEX "InventarioDeBens_unidadeOrcId_exercicio_idx" ON "InventarioDeBens"("unidadeOrcId", "exercicio");

-- CreateIndex
CREATE INDEX "InventarioDeBens_comissaoId_idx" ON "InventarioDeBens"("comissaoId");

-- CreateIndex
CREATE INDEX "ContagemDeBem_bemId_idx" ON "ContagemDeBem"("bemId");

-- CreateIndex
CREATE INDEX "ContagemDeBem_localizacaoObservadaId_idx" ON "ContagemDeBem"("localizacaoObservadaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemDeBem_inventarioId_bemId_key" ON "ContagemDeBem"("inventarioId", "bemId");

-- CreateIndex
CREATE UNIQUE INDEX "TermoPatrimonial_numero_key" ON "TermoPatrimonial"("numero");

-- CreateIndex
CREATE INDEX "TermoPatrimonial_responsavelId_idx" ON "TermoPatrimonial"("responsavelId");

-- CreateIndex
CREATE INDEX "TermoPatrimonial_setorId_idx" ON "TermoPatrimonial"("setorId");

-- CreateIndex
CREATE INDEX "TermoPatrimonial_data_idx" ON "TermoPatrimonial"("data");

-- CreateIndex
CREATE INDEX "ItemDeTermoPatrimonial_bemId_idx" ON "ItemDeTermoPatrimonial"("bemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDeTermoPatrimonial_termoId_bemId_key" ON "ItemDeTermoPatrimonial"("termoId", "bemId");

-- CreateIndex
CREATE UNIQUE INDEX "MotivoDeBaixa_codigo_key" ON "MotivoDeBaixa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDeIncorporacao_codigo_key" ON "TipoDeIncorporacao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaDeAvaliacao_codigo_key" ON "FormulaDeAvaliacao"("codigo");

-- AddForeignKey
ALTER TABLE "BemPatrimonial" ADD CONSTRAINT "BemPatrimonial_tipoDeIncorporacaoId_fkey" FOREIGN KEY ("tipoDeIncorporacaoId") REFERENCES "TipoDeIncorporacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizacaoFisica" ADD CONSTRAINT "LocalizacaoFisica_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "LocalizacaoFisica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizacaoFisica" ADD CONSTRAINT "LocalizacaoFisica_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroDeComissaoPatrimonial" ADD CONSTRAINT "MembroDeComissaoPatrimonial_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "ComissaoPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroDeComissaoPatrimonial" ADD CONSTRAINT "MembroDeComissaoPatrimonial_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "BemPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "LocalizacaoFisica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioDeBens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeGestaoDoBem" ADD CONSTRAINT "MovimentoDeGestaoDoBem_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoDeGestaoDoBem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeBens" ADD CONSTRAINT "InventarioDeBens_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "ComissaoPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeBens" ADD CONSTRAINT "InventarioDeBens_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeBens" ADD CONSTRAINT "InventarioDeBens_termoAberturaId_fkey" FOREIGN KEY ("termoAberturaId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeBens" ADD CONSTRAINT "InventarioDeBens_termoFechamentoId_fkey" FOREIGN KEY ("termoFechamentoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeBem" ADD CONSTRAINT "ContagemDeBem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeBem" ADD CONSTRAINT "ContagemDeBem_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "BemPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeBem" ADD CONSTRAINT "ContagemDeBem_localizacaoObservadaId_fkey" FOREIGN KEY ("localizacaoObservadaId") REFERENCES "LocalizacaoFisica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermoPatrimonial" ADD CONSTRAINT "TermoPatrimonial_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermoPatrimonial" ADD CONSTRAINT "TermoPatrimonial_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermoPatrimonial" ADD CONSTRAINT "TermoPatrimonial_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeTermoPatrimonial" ADD CONSTRAINT "ItemDeTermoPatrimonial_termoId_fkey" FOREIGN KEY ("termoId") REFERENCES "TermoPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeTermoPatrimonial" ADD CONSTRAINT "ItemDeTermoPatrimonial_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "BemPatrimonial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
