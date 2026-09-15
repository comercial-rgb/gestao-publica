-- V7 M2.1 — o contrato acompanhado: designações (gestor/fiscal), itens, agenda, ocorrências com
-- evidência, resolução e medição por itens. Aditiva: nenhuma tabela existente perde coluna.
-- CreateEnum
CREATE TYPE "PapelNoContrato" AS ENUM ('GESTOR', 'FISCAL');

-- CreateEnum
CREATE TYPE "TipoDeOcorrencia" AS ENUM ('CONFORMIDADE', 'NAO_CONFORMIDADE', 'ATRASO', 'IMPEDIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EncaminhamentoDaOcorrencia" AS ENUM ('NENHUM', 'GESTOR');

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "ocorrenciaDeFiscalizacaoId" TEXT;

-- CreateTable
CREATE TABLE "DesignacaoNoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "papel" "PapelNoContrato" NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "atoDesignacao" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DesignacaoNoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevogacaoDeDesignacaoNoContrato" (
    "id" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RevogacaoDeDesignacaoNoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeFiscalizacao" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "objetivo" TEXT NOT NULL,
    "gestorDesignacaoId" TEXT NOT NULL,
    "fiscalDesignacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "OrdemDeFiscalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcorrenciaDeFiscalizacao" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ordemId" TEXT,
    "designacaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoDeOcorrencia" NOT NULL,
    "descricao" TEXT NOT NULL,
    "encaminhamento" "EncaminhamentoDaOcorrencia" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "OcorrenciaDeFiscalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolucaoDeOcorrencia" (
    "id" TEXT NOT NULL,
    "ocorrenciaId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ResolucaoDeOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicaoPorItens" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MedicaoPorItens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemMedido" (
    "id" TEXT NOT NULL,
    "medicaoPorItensId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemMedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignacaoNoContrato_contratoId_papel_idx" ON "DesignacaoNoContrato"("contratoId", "papel");

-- CreateIndex
CREATE INDEX "DesignacaoNoContrato_usuarioId_idx" ON "DesignacaoNoContrato"("usuarioId");

-- CreateIndex
CREATE INDEX "DesignacaoNoContrato_pessoaId_idx" ON "DesignacaoNoContrato"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "RevogacaoDeDesignacaoNoContrato_designacaoId_key" ON "RevogacaoDeDesignacaoNoContrato"("designacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoContrato_contratoId_numero_key" ON "ItemDoContrato"("contratoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeFiscalizacao_contratoId_numero_key" ON "OrdemDeFiscalizacao"("contratoId", "numero");

-- CreateIndex
CREATE INDEX "OcorrenciaDeFiscalizacao_ordemId_idx" ON "OcorrenciaDeFiscalizacao"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "OcorrenciaDeFiscalizacao_contratoId_numero_key" ON "OcorrenciaDeFiscalizacao"("contratoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ResolucaoDeOcorrencia_ocorrenciaId_key" ON "ResolucaoDeOcorrencia"("ocorrenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicaoPorItens_medicaoId_key" ON "MedicaoPorItens"("medicaoId");

-- CreateIndex
CREATE INDEX "ItemMedido_itemId_idx" ON "ItemMedido"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemMedido_medicaoPorItensId_itemId_key" ON "ItemMedido"("medicaoPorItensId", "itemId");

-- CreateIndex
CREATE INDEX "Anexo_ocorrenciaDeFiscalizacaoId_idx" ON "Anexo"("ocorrenciaDeFiscalizacaoId");

-- AddForeignKey
ALTER TABLE "DesignacaoNoContrato" ADD CONSTRAINT "DesignacaoNoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignacaoNoContrato" ADD CONSTRAINT "DesignacaoNoContrato_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignacaoNoContrato" ADD CONSTRAINT "DesignacaoNoContrato_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevogacaoDeDesignacaoNoContrato" ADD CONSTRAINT "RevogacaoDeDesignacaoNoContrato_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoContrato" ADD CONSTRAINT "ItemDoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "OrdemDeFiscalizacao_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "OrdemDeFiscalizacao_gestorDesignacaoId_fkey" FOREIGN KEY ("gestorDesignacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "OrdemDeFiscalizacao_fiscalDesignacaoId_fkey" FOREIGN KEY ("fiscalDesignacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD CONSTRAINT "OcorrenciaDeFiscalizacao_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD CONSTRAINT "OcorrenciaDeFiscalizacao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeFiscalizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD CONSTRAINT "OcorrenciaDeFiscalizacao_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolucaoDeOcorrencia" ADD CONSTRAINT "ResolucaoDeOcorrencia_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "OcorrenciaDeFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolucaoDeOcorrencia" ADD CONSTRAINT "ResolucaoDeOcorrencia_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoPorItens" ADD CONSTRAINT "MedicaoPorItens_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDeObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoPorItens" ADD CONSTRAINT "MedicaoPorItens_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedido" ADD CONSTRAINT "ItemMedido_medicaoPorItensId_fkey" FOREIGN KEY ("medicaoPorItensId") REFERENCES "MedicaoPorItens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedido" ADD CONSTRAINT "ItemMedido_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_ocorrenciaDeFiscalizacaoId_fkey" FOREIGN KEY ("ocorrenciaDeFiscalizacaoId") REFERENCES "OcorrenciaDeFiscalizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As travas que o Prisma não expressa.
ALTER TABLE "ItemDoContrato" ADD CONSTRAINT "ck_item_do_contrato" CHECK ("quantidade" > 0 AND "valorUnitario" >= 0 AND "numero" >= 1 AND length(btrim("descricao")) >= 3 AND length(btrim("unidade")) >= 1);
ALTER TABLE "ItemMedido" ADD CONSTRAINT "ck_item_medido" CHECK ("quantidade" > 0 AND "valor" >= 0);
ALTER TABLE "DesignacaoNoContrato" ADD CONSTRAINT "ck_designacao_no_contrato" CHECK (length(btrim("atoDesignacao")) >= 3 AND ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio"));
ALTER TABLE "RevogacaoDeDesignacaoNoContrato" ADD CONSTRAINT "ck_revogacao_no_contrato" CHECK (length(btrim("motivo")) >= 5);
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD CONSTRAINT "ck_ocorrencia" CHECK (length(btrim("descricao")) >= 10 AND "numero" >= 1);
ALTER TABLE "ResolucaoDeOcorrencia" ADD CONSTRAINT "ck_resolucao" CHECK (length(btrim("texto")) >= 10);
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "ck_ordem_de_fiscalizacao" CHECK (length(btrim("objetivo")) >= 10 AND "numero" >= 1);
