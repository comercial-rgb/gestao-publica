-- CreateEnum
CREATE TYPE "ModalidadeLicitacao" AS ENUM ('PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL', 'CONCORRENCIA', 'CONCURSO', 'LEILAO', 'DIALOGO_COMPETITIVO', 'DISPENSA', 'INEXIGIBILIDADE');

-- CreateEnum
CREATE TYPE "TipoMovimentoContratual" AS ENUM ('ACRESCIMO_VALOR', 'SUPRESSAO_VALOR', 'PRORROGACAO_PRAZO', 'ESTORNO_ACRESCIMO_VALOR', 'ESTORNO_SUPRESSAO_VALOR', 'ESTORNO_PRORROGACAO_PRAZO');

-- CreateTable
CREATE TABLE "ProcessoLicitatorio" (
    "id" TEXT NOT NULL,
    "numeroProcesso" TEXT NOT NULL,
    "modalidade" "ModalidadeLicitacao" NOT NULL,
    "objeto" TEXT NOT NULL,
    "valorLicitado" DECIMAL(18,2) NOT NULL,
    "dataHomologacao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProcessoLicitatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "numeroContrato" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "contratadoDocumento" TEXT NOT NULL,
    "contratadoNome" TEXT NOT NULL,
    "valorInicial" DECIMAL(18,2) NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFimInicial" TIMESTAMP(3) NOT NULL,
    "categoriaOrdemCronologica" "CategoriaOrdemCronologica" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoContratual" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoContratual" NOT NULL,
    "valor" DECIMAL(18,2),
    "dias" INTEGER,
    "data" TIMESTAMP(3) NOT NULL,
    "numeroAditivo" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoContratual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessoLicitatorio_numeroProcesso_key" ON "ProcessoLicitatorio"("numeroProcesso");

-- CreateIndex
CREATE INDEX "ProcessoLicitatorio_modalidade_idx" ON "ProcessoLicitatorio"("modalidade");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numeroContrato_key" ON "Contrato"("numeroContrato");

-- CreateIndex
CREATE INDEX "Contrato_processoId_idx" ON "Contrato"("processoId");

-- CreateIndex
CREATE INDEX "Contrato_contratadoDocumento_idx" ON "Contrato"("contratadoDocumento");

-- CreateIndex
CREATE INDEX "MovimentoContratual_contratoId_idx" ON "MovimentoContratual"("contratoId");

-- CreateIndex
CREATE INDEX "MovimentoContratual_estornoDeId_idx" ON "MovimentoContratual"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoContratual_data_idx" ON "MovimentoContratual"("data");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoContratual" ADD CONSTRAINT "MovimentoContratual_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoContratual" ADD CONSTRAINT "MovimentoContratual_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoContratual"("id") ON DELETE SET NULL ON UPDATE CASCADE;
