-- CreateEnum
CREATE TYPE "EspecieDeBem" AS ENUM ('MOVEL', 'IMOVEL');

-- CreateEnum
CREATE TYPE "TipoMovimentoPatrimonial" AS ENUM ('AQUISICAO', 'AVALIACAO_INICIAL', 'CUSTO_SUBSEQUENTE', 'DOACAO_RECEBIDA', 'REAVALIACAO_AUMENTO', 'DEPRECIACAO', 'EXAUSTAO', 'IMPAIRMENT', 'REAVALIACAO_REDUCAO', 'DOACAO_REALIZADA', 'BAIXA_ALIENACAO', 'ESTORNO_AQUISICAO', 'ESTORNO_AVALIACAO_INICIAL', 'ESTORNO_CUSTO_SUBSEQUENTE', 'ESTORNO_DOACAO_RECEBIDA', 'ESTORNO_REAVALIACAO_AUMENTO', 'ESTORNO_DEPRECIACAO', 'ESTORNO_EXAUSTAO', 'ESTORNO_IMPAIRMENT', 'ESTORNO_REAVALIACAO_REDUCAO', 'ESTORNO_DOACAO_REALIZADA', 'ESTORNO_BAIXA_ALIENACAO');

-- CreateTable
CREATE TABLE "ClasseDeBens" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "especie" "EspecieDeBem" NOT NULL,
    "contaContabilAtivoId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ClasseDeBens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BemPatrimonial" (
    "id" TEXT NOT NULL,
    "numeroTombamento" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "classeDeBensId" TEXT NOT NULL,
    "dataAquisicao" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BemPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoPatrimonial" (
    "id" TEXT NOT NULL,
    "classeDeBensId" TEXT NOT NULL,
    "bemId" TEXT,
    "tipo" "TipoMovimentoPatrimonial" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "competencia" TIMESTAMP(3),
    "liquidacaoId" TEXT,
    "estornoDeId" TEXT,
    "lancamentoId" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroPatrimonial" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoPatrimonial" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroPatrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClasseDeBens_codigo_key" ON "ClasseDeBens"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "BemPatrimonial_numeroTombamento_key" ON "BemPatrimonial"("numeroTombamento");

-- CreateIndex
CREATE INDEX "BemPatrimonial_classeDeBensId_idx" ON "BemPatrimonial"("classeDeBensId");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_classeDeBensId_tipo_idx" ON "MovimentoPatrimonial"("classeDeBensId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_bemId_idx" ON "MovimentoPatrimonial"("bemId");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_estornoDeId_idx" ON "MovimentoPatrimonial"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_liquidacaoId_idx" ON "MovimentoPatrimonial"("liquidacaoId");

-- CreateIndex
CREATE INDEX "MovimentoPatrimonial_dataMovimento_idx" ON "MovimentoPatrimonial"("dataMovimento");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroPatrimonial_tipo_key" ON "RoteiroPatrimonial"("tipo");

-- AddForeignKey
ALTER TABLE "ClasseDeBens" ADD CONSTRAINT "ClasseDeBens_contaContabilAtivoId_fkey" FOREIGN KEY ("contaContabilAtivoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BemPatrimonial" ADD CONSTRAINT "BemPatrimonial_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "BemPatrimonial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoPatrimonial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroPatrimonial" ADD CONSTRAINT "RoteiroPatrimonial_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroPatrimonial" ADD CONSTRAINT "RoteiroPatrimonial_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
