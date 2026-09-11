-- CreateEnum
CREATE TYPE "TipoMovimentoDaSolicitacao" AS ENUM ('AUTORIZACAO', 'ANULACAO');

-- CreateEnum
CREATE TYPE "TipoDeOrdemDeCompra" AS ENUM ('ORDINARIA', 'GLOBAL', 'ESTIMATIVA');

-- CreateTable
CREATE TABLE "MarcaAprovada" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MarcaAprovada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialMarca" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MaterialMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialElementoDespesa" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "naturezaDespesaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MaterialElementoDespesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoDeCompra" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "setorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "solicitante" TEXT NOT NULL,
    "processoDigitalId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SolicitacaoDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeSolicitacaoDeCompra" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeSolicitacaoDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaSolicitacao" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaSolicitacao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesquisaDePrecos" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "objeto" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PesquisaDePrecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDePesquisaDePrecos" (
    "id" TEXT NOT NULL,
    "pesquisaId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDePesquisaDePrecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoDePreco" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "valorUnitario" DECIMAL(18,6) NOT NULL,
    "origem" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CotacaoDePreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeCompra" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "tipo" "TipoDeOrdemDeCompra" NOT NULL,
    "processoId" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3),
    "finalidade" TEXT NOT NULL,
    "fichaId" TEXT,
    "consumoImediato" BOOLEAN NOT NULL DEFAULT false,
    "desconto" DECIMAL(18,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "OrdemDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeOrdemDeCompra" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,6) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeOrdemDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoDeOrdem" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "notaFiscal" TEXT,
    "responsavelRecebimento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RecebimentoDeOrdem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoDeItem" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "itemDeOrdemId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "movimentoFisicoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RecebimentoDeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarcaAprovada_nome_key" ON "MarcaAprovada"("nome");

-- CreateIndex
CREATE INDEX "MaterialMarca_marcaId_idx" ON "MaterialMarca"("marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialMarca_materialId_marcaId_key" ON "MaterialMarca"("materialId", "marcaId");

-- CreateIndex
CREATE INDEX "MaterialElementoDespesa_naturezaDespesaId_idx" ON "MaterialElementoDespesa"("naturezaDespesaId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialElementoDespesa_materialId_naturezaDespesaId_key" ON "MaterialElementoDespesa"("materialId", "naturezaDespesaId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoDeCompra_numero_key" ON "SolicitacaoDeCompra"("numero");

-- CreateIndex
CREATE INDEX "SolicitacaoDeCompra_setorId_data_idx" ON "SolicitacaoDeCompra"("setorId", "data");

-- CreateIndex
CREATE INDEX "SolicitacaoDeCompra_processoDigitalId_idx" ON "SolicitacaoDeCompra"("processoDigitalId");

-- CreateIndex
CREATE INDEX "ItemDeSolicitacaoDeCompra_solicitacaoId_idx" ON "ItemDeSolicitacaoDeCompra"("solicitacaoId");

-- CreateIndex
CREATE INDEX "ItemDeSolicitacaoDeCompra_materialId_idx" ON "ItemDeSolicitacaoDeCompra"("materialId");

-- CreateIndex
CREATE INDEX "MovimentoDaSolicitacao_solicitacaoId_tipo_idx" ON "MovimentoDaSolicitacao"("solicitacaoId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "PesquisaDePrecos_numero_key" ON "PesquisaDePrecos"("numero");

-- CreateIndex
CREATE INDEX "PesquisaDePrecos_data_idx" ON "PesquisaDePrecos"("data");

-- CreateIndex
CREATE INDEX "ItemDePesquisaDePrecos_materialId_idx" ON "ItemDePesquisaDePrecos"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDePesquisaDePrecos_pesquisaId_materialId_key" ON "ItemDePesquisaDePrecos"("pesquisaId", "materialId");

-- CreateIndex
CREATE INDEX "CotacaoDePreco_fornecedorId_idx" ON "CotacaoDePreco"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoDePreco_itemId_fornecedorId_key" ON "CotacaoDePreco"("itemId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeCompra_numero_key" ON "OrdemDeCompra"("numero");

-- CreateIndex
CREATE INDEX "OrdemDeCompra_fornecedorId_idx" ON "OrdemDeCompra"("fornecedorId");

-- CreateIndex
CREATE INDEX "OrdemDeCompra_processoId_idx" ON "OrdemDeCompra"("processoId");

-- CreateIndex
CREATE INDEX "OrdemDeCompra_dataEmissao_idx" ON "OrdemDeCompra"("dataEmissao");

-- CreateIndex
CREATE INDEX "OrdemDeCompra_fichaId_idx" ON "OrdemDeCompra"("fichaId");

-- CreateIndex
CREATE INDEX "ItemDeOrdemDeCompra_ordemId_idx" ON "ItemDeOrdemDeCompra"("ordemId");

-- CreateIndex
CREATE INDEX "ItemDeOrdemDeCompra_materialId_idx" ON "ItemDeOrdemDeCompra"("materialId");

-- CreateIndex
CREATE INDEX "RecebimentoDeOrdem_ordemId_data_idx" ON "RecebimentoDeOrdem"("ordemId", "data");

-- CreateIndex
CREATE INDEX "RecebimentoDeItem_recebimentoId_idx" ON "RecebimentoDeItem"("recebimentoId");

-- CreateIndex
CREATE INDEX "RecebimentoDeItem_itemDeOrdemId_idx" ON "RecebimentoDeItem"("itemDeOrdemId");

-- CreateIndex
CREATE INDEX "RecebimentoDeItem_movimentoFisicoId_idx" ON "RecebimentoDeItem"("movimentoFisicoId");

-- AddForeignKey
ALTER TABLE "MaterialMarca" ADD CONSTRAINT "MaterialMarca_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialMarca" ADD CONSTRAINT "MaterialMarca_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "MarcaAprovada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialElementoDespesa" ADD CONSTRAINT "MaterialElementoDespesa_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialElementoDespesa" ADD CONSTRAINT "MaterialElementoDespesa_naturezaDespesaId_fkey" FOREIGN KEY ("naturezaDespesaId") REFERENCES "NaturezaDespesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeCompra" ADD CONSTRAINT "SolicitacaoDeCompra_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeCompra" ADD CONSTRAINT "SolicitacaoDeCompra_processoDigitalId_fkey" FOREIGN KEY ("processoDigitalId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeSolicitacaoDeCompra" ADD CONSTRAINT "ItemDeSolicitacaoDeCompra_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeSolicitacaoDeCompra" ADD CONSTRAINT "ItemDeSolicitacaoDeCompra_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaSolicitacao" ADD CONSTRAINT "MovimentoDaSolicitacao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDePesquisaDePrecos" ADD CONSTRAINT "ItemDePesquisaDePrecos_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "PesquisaDePrecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDePesquisaDePrecos" ADD CONSTRAINT "ItemDePesquisaDePrecos_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoDePreco" ADD CONSTRAINT "CotacaoDePreco_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDePesquisaDePrecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoDePreco" ADD CONSTRAINT "CotacaoDePreco_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeCompra" ADD CONSTRAINT "OrdemDeCompra_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeCompra" ADD CONSTRAINT "OrdemDeCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeCompra" ADD CONSTRAINT "OrdemDeCompra_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeOrdemDeCompra" ADD CONSTRAINT "ItemDeOrdemDeCompra_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeOrdemDeCompra" ADD CONSTRAINT "ItemDeOrdemDeCompra_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoDeOrdem" ADD CONSTRAINT "RecebimentoDeOrdem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoDeItem" ADD CONSTRAINT "RecebimentoDeItem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "RecebimentoDeOrdem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoDeItem" ADD CONSTRAINT "RecebimentoDeItem_itemDeOrdemId_fkey" FOREIGN KEY ("itemDeOrdemId") REFERENCES "ItemDeOrdemDeCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoDeItem" ADD CONSTRAINT "RecebimentoDeItem_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
