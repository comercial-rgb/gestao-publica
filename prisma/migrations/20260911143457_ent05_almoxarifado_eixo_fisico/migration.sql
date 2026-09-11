-- CreateEnum
CREATE TYPE "ClassificacaoDeMaterial" AS ENUM ('CONSUMO', 'PERMANENTE', 'SERVICO', 'OBRA');

-- CreateEnum
CREATE TYPE "CategoriaDeMaterial" AS ENUM ('PERECIVEL', 'NAO_PERECIVEL', 'ESTOCAVEL', 'COMBUSTIVEL');

-- CreateEnum
CREATE TYPE "TipoMovimentoFisicoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'ESTORNO_ENTRADA', 'ESTORNO_SAIDA', 'ESTORNO_TRANSFERENCIA_SAIDA', 'ESTORNO_TRANSFERENCIA_ENTRADA', 'ESTORNO_AJUSTE_ENTRADA', 'ESTORNO_AJUSTE_SAIDA');

-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadeDeMedida" (
    "id" TEXT NOT NULL,
    "sigla" VARCHAR(10) NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "UnidadeDeMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUnidade" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unidadeDeMedidaId" TEXT NOT NULL,
    "fatorParaEstoque" DECIMAL(18,6) NOT NULL,
    "ehDeEstoque" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MaterialUnidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoDeMaterial" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "paiId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "GrupoDeMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricaoSucinta" TEXT NOT NULL,
    "descricaoDetalhada" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "classificacao" "ClassificacaoDeMaterial" NOT NULL,
    "categoria" "CategoriaDeMaterial" NOT NULL,
    "catmat" VARCHAR(20),
    "classeDeMaterialId" TEXT NOT NULL,
    "controlaLote" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroDeEstoque" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "quantidadeMinima" DECIMAL(18,4),
    "quantidadeMaxima" DECIMAL(18,4),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParametroDeEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteDeMaterial" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "identificacao" VARCHAR(60) NOT NULL,
    "validade" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LoteDeMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoFisicoDeEstoque" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "loteId" TEXT,
    "tipo" "TipoMovimentoFisicoEstoque" NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,6) NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "setorId" TEXT,
    "movimentoAlmoxarifadoId" TEXT,
    "itemDeRequisicaoId" TEXT,
    "operacaoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoFisicoDeEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicaoDeMaterial" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "depositoId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "dataRequisicao" TIMESTAMP(3) NOT NULL,
    "solicitante" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RequisicaoDeMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeRequisicaoDeMaterial" (
    "id" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantidadeSolicitada" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeRequisicaoDeMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotaDeConsumo" (
    "id" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "quantidadeLimite" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CotaDeConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioDeEstoque" (
    "id" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "dataAbertura" TIMESTAMP(3) NOT NULL,
    "dataFechamento" TIMESTAMP(3),
    "termoAberturaId" TEXT,
    "termoFechamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "InventarioDeEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContagemDeInventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "loteId" TEXT,
    "quantidadeContada" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContagemDeInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioDeEstoque" (
    "id" TEXT NOT NULL,
    "materialId" TEXT,
    "depositoId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BloqueioDeEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deposito_codigo_key" ON "Deposito"("codigo");

-- CreateIndex
CREATE INDEX "Deposito_unidadeOrcId_idx" ON "Deposito"("unidadeOrcId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeDeMedida_sigla_key" ON "UnidadeDeMedida"("sigla");

-- CreateIndex
CREATE INDEX "MaterialUnidade_unidadeDeMedidaId_idx" ON "MaterialUnidade"("unidadeDeMedidaId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUnidade_materialId_unidadeDeMedidaId_key" ON "MaterialUnidade"("materialId", "unidadeDeMedidaId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoDeMaterial_codigo_key" ON "GrupoDeMaterial"("codigo");

-- CreateIndex
CREATE INDEX "GrupoDeMaterial_paiId_idx" ON "GrupoDeMaterial"("paiId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_codigo_key" ON "Material"("codigo");

-- CreateIndex
CREATE INDEX "Material_grupoId_idx" ON "Material"("grupoId");

-- CreateIndex
CREATE INDEX "Material_classeDeMaterialId_idx" ON "Material"("classeDeMaterialId");

-- CreateIndex
CREATE INDEX "Material_catmat_idx" ON "Material"("catmat");

-- CreateIndex
CREATE INDEX "ParametroDeEstoque_depositoId_idx" ON "ParametroDeEstoque"("depositoId");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroDeEstoque_materialId_depositoId_key" ON "ParametroDeEstoque"("materialId", "depositoId");

-- CreateIndex
CREATE INDEX "LoteDeMaterial_validade_idx" ON "LoteDeMaterial"("validade");

-- CreateIndex
CREATE INDEX "LoteDeMaterial_depositoId_idx" ON "LoteDeMaterial"("depositoId");

-- CreateIndex
CREATE UNIQUE INDEX "LoteDeMaterial_materialId_depositoId_identificacao_key" ON "LoteDeMaterial"("materialId", "depositoId", "identificacao");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_materialId_depositoId_dataMoviment_idx" ON "MovimentoFisicoDeEstoque"("materialId", "depositoId", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_depositoId_dataMovimento_idx" ON "MovimentoFisicoDeEstoque"("depositoId", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_loteId_idx" ON "MovimentoFisicoDeEstoque"("loteId");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_setorId_idx" ON "MovimentoFisicoDeEstoque"("setorId");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_itemDeRequisicaoId_idx" ON "MovimentoFisicoDeEstoque"("itemDeRequisicaoId");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_estornoDeId_idx" ON "MovimentoFisicoDeEstoque"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_operacaoId_idx" ON "MovimentoFisicoDeEstoque"("operacaoId");

-- CreateIndex
CREATE INDEX "MovimentoFisicoDeEstoque_movimentoAlmoxarifadoId_idx" ON "MovimentoFisicoDeEstoque"("movimentoAlmoxarifadoId");

-- CreateIndex
CREATE UNIQUE INDEX "RequisicaoDeMaterial_numero_key" ON "RequisicaoDeMaterial"("numero");

-- CreateIndex
CREATE INDEX "RequisicaoDeMaterial_depositoId_dataRequisicao_idx" ON "RequisicaoDeMaterial"("depositoId", "dataRequisicao");

-- CreateIndex
CREATE INDEX "RequisicaoDeMaterial_setorId_idx" ON "RequisicaoDeMaterial"("setorId");

-- CreateIndex
CREATE INDEX "ItemDeRequisicaoDeMaterial_requisicaoId_idx" ON "ItemDeRequisicaoDeMaterial"("requisicaoId");

-- CreateIndex
CREATE INDEX "ItemDeRequisicaoDeMaterial_materialId_idx" ON "ItemDeRequisicaoDeMaterial"("materialId");

-- CreateIndex
CREATE INDEX "CotaDeConsumo_materialId_idx" ON "CotaDeConsumo"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CotaDeConsumo_setorId_materialId_competencia_key" ON "CotaDeConsumo"("setorId", "materialId", "competencia");

-- CreateIndex
CREATE INDEX "InventarioDeEstoque_depositoId_dataAbertura_idx" ON "InventarioDeEstoque"("depositoId", "dataAbertura");

-- CreateIndex
CREATE INDEX "ContagemDeInventario_materialId_idx" ON "ContagemDeInventario"("materialId");

-- CreateIndex
CREATE INDEX "ContagemDeInventario_loteId_idx" ON "ContagemDeInventario"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemDeInventario_inventarioId_materialId_loteId_key" ON "ContagemDeInventario"("inventarioId", "materialId", "loteId");

-- CreateIndex
CREATE INDEX "BloqueioDeEstoque_materialId_inicio_idx" ON "BloqueioDeEstoque"("materialId", "inicio");

-- CreateIndex
CREATE INDEX "BloqueioDeEstoque_depositoId_inicio_idx" ON "BloqueioDeEstoque"("depositoId", "inicio");

-- AddForeignKey
ALTER TABLE "Deposito" ADD CONSTRAINT "Deposito_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposito" ADD CONSTRAINT "Deposito_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUnidade" ADD CONSTRAINT "MaterialUnidade_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUnidade" ADD CONSTRAINT "MaterialUnidade_unidadeDeMedidaId_fkey" FOREIGN KEY ("unidadeDeMedidaId") REFERENCES "UnidadeDeMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoDeMaterial" ADD CONSTRAINT "GrupoDeMaterial_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "GrupoDeMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_classeDeMaterialId_fkey" FOREIGN KEY ("classeDeMaterialId") REFERENCES "ClasseDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroDeEstoque" ADD CONSTRAINT "ParametroDeEstoque_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroDeEstoque" ADD CONSTRAINT "ParametroDeEstoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteDeMaterial" ADD CONSTRAINT "LoteDeMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteDeMaterial" ADD CONSTRAINT "LoteDeMaterial_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDeMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_movimentoAlmoxarifadoId_fkey" FOREIGN KEY ("movimentoAlmoxarifadoId") REFERENCES "MovimentoAlmoxarifado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_itemDeRequisicaoId_fkey" FOREIGN KEY ("itemDeRequisicaoId") REFERENCES "ItemDeRequisicaoDeMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFisicoDeEstoque" ADD CONSTRAINT "MovimentoFisicoDeEstoque_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoDeMaterial" ADD CONSTRAINT "RequisicaoDeMaterial_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoDeMaterial" ADD CONSTRAINT "RequisicaoDeMaterial_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeRequisicaoDeMaterial" ADD CONSTRAINT "ItemDeRequisicaoDeMaterial_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "RequisicaoDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeRequisicaoDeMaterial" ADD CONSTRAINT "ItemDeRequisicaoDeMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotaDeConsumo" ADD CONSTRAINT "CotaDeConsumo_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotaDeConsumo" ADD CONSTRAINT "CotaDeConsumo_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeEstoque" ADD CONSTRAINT "InventarioDeEstoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeEstoque" ADD CONSTRAINT "InventarioDeEstoque_termoAberturaId_fkey" FOREIGN KEY ("termoAberturaId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioDeEstoque" ADD CONSTRAINT "InventarioDeEstoque_termoFechamentoId_fkey" FOREIGN KEY ("termoFechamentoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeInventario" ADD CONSTRAINT "ContagemDeInventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeInventario" ADD CONSTRAINT "ContagemDeInventario_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemDeInventario" ADD CONSTRAINT "ContagemDeInventario_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDeMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEstoque" ADD CONSTRAINT "BloqueioDeEstoque_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEstoque" ADD CONSTRAINT "BloqueioDeEstoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
