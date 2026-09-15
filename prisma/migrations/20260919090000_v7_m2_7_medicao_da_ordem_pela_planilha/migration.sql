-- V7 M2 U7 — a medição da ordem de serviço pela planilha orçamentária da obra, a memória e o estorno da medição.
-- Aditiva: três tabelas novas e uma coluna nullable em "Anexo". Nenhum DROP.

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "medicaoDaOrdemId" TEXT;

-- CreateTable
CREATE TABLE "MedicaoDaOrdemNaPlanilha" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "planilhaId" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MedicaoDaOrdemNaPlanilha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemMedidoDaOrdemNaPlanilha" (
    "id" TEXT NOT NULL,
    "medicaoNaPlanilhaId" TEXT NOT NULL,
    "itemMedidoId" TEXT NOT NULL,
    "itemDaPlanilhaId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "precoDaPlanilha" DECIMAL(18,4) NOT NULL,
    "valorNaPlanilha" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemMedidoDaOrdemNaPlanilha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstornoDeMedicaoDaOrdem" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EstornoDeMedicaoDaOrdem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicaoDaOrdemNaPlanilha_medicaoId_key" ON "MedicaoDaOrdemNaPlanilha"("medicaoId");

-- CreateIndex
CREATE INDEX "MedicaoDaOrdemNaPlanilha_planilhaId_idx" ON "MedicaoDaOrdemNaPlanilha"("planilhaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemMedidoDaOrdemNaPlanilha_itemMedidoId_key" ON "ItemMedidoDaOrdemNaPlanilha"("itemMedidoId");

-- CreateIndex
CREATE INDEX "ItemMedidoDaOrdemNaPlanilha_itemDaPlanilhaId_idx" ON "ItemMedidoDaOrdemNaPlanilha"("itemDaPlanilhaId");

-- CreateIndex
CREATE INDEX "ItemMedidoDaOrdemNaPlanilha_codigo_idx" ON "ItemMedidoDaOrdemNaPlanilha"("codigo");

-- CreateIndex
CREATE INDEX "ItemMedidoDaOrdemNaPlanilha_vinculoId_idx" ON "ItemMedidoDaOrdemNaPlanilha"("vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemMedidoDaOrdemNaPlanilha_medicaoNaPlanilhaId_itemDaPlani_key" ON "ItemMedidoDaOrdemNaPlanilha"("medicaoNaPlanilhaId", "itemDaPlanilhaId");

-- CreateIndex
CREATE UNIQUE INDEX "EstornoDeMedicaoDaOrdem_medicaoId_key" ON "EstornoDeMedicaoDaOrdem"("medicaoId");

-- CreateIndex
CREATE INDEX "Anexo_medicaoDaOrdemId_idx" ON "Anexo"("medicaoDaOrdemId");

-- AddForeignKey
ALTER TABLE "MedicaoDaOrdemNaPlanilha" ADD CONSTRAINT "MedicaoDaOrdemNaPlanilha_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoDaOrdemNaPlanilha" ADD CONSTRAINT "MedicaoDaOrdemNaPlanilha_planilhaId_fkey" FOREIGN KEY ("planilhaId") REFERENCES "PlanilhaOrcamentariaDaObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ItemMedidoDaOrdemNaPlanilha_medicaoNaPlanilhaId_fkey" FOREIGN KEY ("medicaoNaPlanilhaId") REFERENCES "MedicaoDaOrdemNaPlanilha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ItemMedidoDaOrdemNaPlanilha_itemMedidoId_fkey" FOREIGN KEY ("itemMedidoId") REFERENCES "ItemMedidoNaOrdem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ItemMedidoDaOrdemNaPlanilha_itemDaPlanilhaId_fkey" FOREIGN KEY ("itemDaPlanilhaId") REFERENCES "ItemDaPlanilhaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ItemMedidoDaOrdemNaPlanilha_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "VinculoDeItemDaPlanilhaAoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstornoDeMedicaoDaOrdem" ADD CONSTRAINT "EstornoDeMedicaoDaOrdem_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstornoDeMedicaoDaOrdem" ADD CONSTRAINT "EstornoDeMedicaoDaOrdem_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_medicaoDaOrdemId_fkey" FOREIGN KEY ("medicaoDaOrdemId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Checks que o Prisma não representa (a regra continua no caso de uso; o banco recusa a linha impossível).
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ck_item_medido_planilha_quantidade_positiva" CHECK ("quantidade" > 0);
ALTER TABLE "ItemMedidoDaOrdemNaPlanilha" ADD CONSTRAINT "ck_item_medido_planilha_preco_nao_negativo" CHECK ("precoDaPlanilha" >= 0);
ALTER TABLE "EstornoDeMedicaoDaOrdem" ADD CONSTRAINT "ck_estorno_medicao_ordem_motivo" CHECK (char_length(btrim("motivo")) >= 10);
ALTER TABLE "MedicaoDaOrdemNaPlanilha" ADD CONSTRAINT "ck_medicao_ordem_planilha_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
