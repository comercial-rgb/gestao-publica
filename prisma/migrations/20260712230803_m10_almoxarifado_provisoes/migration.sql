-- CreateEnum
CREATE TYPE "TipoMovimentoAlmoxarifado" AS ENUM ('ENTRADA', 'SAIDA_CONSUMO', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'ESTORNO_ENTRADA', 'ESTORNO_SAIDA_CONSUMO', 'ESTORNO_AJUSTE_ENTRADA', 'ESTORNO_AJUSTE_SAIDA');

-- CreateEnum
CREATE TYPE "TipoMovimentoProvisao" AS ENUM ('CONSTITUICAO', 'ATUALIZACAO', 'REVERSAO', 'ESTORNO_CONSTITUICAO', 'ESTORNO_ATUALIZACAO', 'ESTORNO_REVERSAO');

-- CreateTable
CREATE TABLE "ClasseDeMaterial" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ClasseDeMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoAlmoxarifado" (
    "id" TEXT NOT NULL,
    "classeDeMaterialId" TEXT NOT NULL,
    "tipo" "TipoMovimentoAlmoxarifado" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "liquidacaoId" TEXT,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoAlmoxarifado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroAlmoxarifado" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoAlmoxarifado" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroAlmoxarifado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisaoMatematica" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProvisaoMatematica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoProvisao" (
    "id" TEXT NOT NULL,
    "provisaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoProvisao" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "competencia" TIMESTAMP(3),
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoProvisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroProvisao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoProvisao" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroProvisao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClasseDeMaterial_codigo_key" ON "ClasseDeMaterial"("codigo");

-- CreateIndex
CREATE INDEX "MovimentoAlmoxarifado_classeDeMaterialId_tipo_idx" ON "MovimentoAlmoxarifado"("classeDeMaterialId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoAlmoxarifado_dataMovimento_idx" ON "MovimentoAlmoxarifado"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoAlmoxarifado_liquidacaoId_idx" ON "MovimentoAlmoxarifado"("liquidacaoId");

-- CreateIndex
CREATE INDEX "MovimentoAlmoxarifado_estornoDeId_idx" ON "MovimentoAlmoxarifado"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroAlmoxarifado_tipo_key" ON "RoteiroAlmoxarifado"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisaoMatematica_identificador_key" ON "ProvisaoMatematica"("identificador");

-- CreateIndex
CREATE INDEX "MovimentoProvisao_provisaoId_tipo_idx" ON "MovimentoProvisao"("provisaoId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoProvisao_dataMovimento_idx" ON "MovimentoProvisao"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoProvisao_estornoDeId_idx" ON "MovimentoProvisao"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroProvisao_tipo_key" ON "RoteiroProvisao"("tipo");

-- AddForeignKey
ALTER TABLE "ClasseDeMaterial" ADD CONSTRAINT "ClasseDeMaterial_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoAlmoxarifado" ADD CONSTRAINT "MovimentoAlmoxarifado_classeDeMaterialId_fkey" FOREIGN KEY ("classeDeMaterialId") REFERENCES "ClasseDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoAlmoxarifado" ADD CONSTRAINT "MovimentoAlmoxarifado_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoAlmoxarifado" ADD CONSTRAINT "MovimentoAlmoxarifado_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoAlmoxarifado" ADD CONSTRAINT "MovimentoAlmoxarifado_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoAlmoxarifado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroAlmoxarifado" ADD CONSTRAINT "RoteiroAlmoxarifado_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroAlmoxarifado" ADD CONSTRAINT "RoteiroAlmoxarifado_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisaoMatematica" ADD CONSTRAINT "ProvisaoMatematica_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoProvisao" ADD CONSTRAINT "MovimentoProvisao_provisaoId_fkey" FOREIGN KEY ("provisaoId") REFERENCES "ProvisaoMatematica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoProvisao" ADD CONSTRAINT "MovimentoProvisao_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoProvisao" ADD CONSTRAINT "MovimentoProvisao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoProvisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroProvisao" ADD CONSTRAINT "RoteiroProvisao_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroProvisao" ADD CONSTRAINT "RoteiroProvisao_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
