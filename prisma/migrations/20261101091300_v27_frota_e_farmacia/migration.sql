-- V27 — M36 frota e M37 farmácia pública: o que o SAGRES pede (leiaute 2026 v1.1, §4.50 a §4.57). Aditiva.

-- CreateEnum
CREATE TYPE "TipoDeFrota" AS ENUM ('PROPRIO', 'LOCADO', 'PRESTACAO_DE_SERVICOS', 'CEDIDO');

-- CreateEnum
CREATE TYPE "SituacaoDaFrota" AS ENUM ('EM_USO', 'EM_MANUTENCAO', 'BAIXADA', 'BAIXA_TEMPORARIA');

-- CreateEnum
CREATE TYPE "CombustivelDaFrota" AS ENUM ('GASOLINA', 'DIESEL', 'ETANOL', 'GAS_NATURAL', 'ARLA_32', 'ELETRICIDADE');

-- CreateEnum
CREATE TYPE "OrigemDoInformeDeEstoque" AS ENUM ('DIGITADO', 'ARQUIVO');
CREATE TABLE "VeiculoDaFrota" (
    "id" TEXT NOT NULL,
    "ugId" TEXT NOT NULL,
    "placa" VARCHAR(7) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VeiculoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoVeiculo" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "anoModelo" INTEGER NOT NULL,
    "renavam" VARCHAR(11) NOT NULL,
    "numeroModelo" VARCHAR(6),
    "tipoFrota" "TipoDeFrota" NOT NULL,
    "proprietarioId" TEXT,
    "locadorId" TEXT,
    "combustivelPrincipal" "CombustivelDaFrota" NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaquinaDaFrota" (
    "id" TEXT NOT NULL,
    "ugId" TEXT NOT NULL,
    "codigo" VARCHAR(7) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MaquinaDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDaMaquina" (
    "id" TEXT NOT NULL,
    "maquinaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "anoFabricacao" INTEGER NOT NULL,
    "descricao" VARCHAR(50) NOT NULL,
    "tipoFrota" "TipoDeFrota" NOT NULL,
    "proprietarioId" TEXT,
    "locadorId" TEXT,
    "combustivelPrincipal" "CombustivelDaFrota" NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDaMaquina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MudancaDeSituacaoDaFrota" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "situacao" "SituacaoDaFrota" NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MudancaDeSituacaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnulacaoDeSituacaoDaFrota" (
    "id" TEXT NOT NULL,
    "mudancaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnulacaoDeSituacaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbastecimentoDaFrota" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "combustivel" "CombustivelDaFrota" NOT NULL,
    "quantidade" DECIMAL(15,2) NOT NULL,
    "documento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AbastecimentoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnulacaoDeAbastecimento" (
    "id" TEXT NOT NULL,
    "abastecimentoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnulacaoDeAbastecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmaciaPublica" (
    "id" TEXT NOT NULL,
    "ugId" TEXT NOT NULL,
    "codigo" VARCHAR(7) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FarmaciaPublica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDaFarmacia" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "descricao" VARCHAR(60) NOT NULL,
    "endereco" VARCHAR(120) NOT NULL,
    "nomeResponsavel" VARCHAR(60) NOT NULL,
    "cpfResponsavel" VARCHAR(11) NOT NULL,
    "crfResponsavel" VARCHAR(10) NOT NULL,
    "ativa" BOOLEAN NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDaFarmacia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformeDeEstoqueDaFarmacia" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "origem" "OrigemDoInformeDeEstoque" NOT NULL,
    "arquivoHash" VARCHAR(64),
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "InformeDeEstoqueDaFarmacia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoInformeDeEstoque" (
    "id" TEXT NOT NULL,
    "informeId" TEXT NOT NULL,
    "codigoProduto" VARCHAR(14) NOT NULL,
    "descricao" VARCHAR(60) NOT NULL,
    "unidadeMedida" VARCHAR(10) NOT NULL,
    "quantidade" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "ItemDoInformeDeEstoque_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "VeiculoDaFrota_placa_key" ON "VeiculoDaFrota"("placa");
-- CreateIndex
CREATE INDEX "VeiculoDaFrota_ugId_idx" ON "VeiculoDaFrota"("ugId");
-- CreateIndex
CREATE INDEX "VersaoDoVeiculo_vigenteDesde_idx" ON "VersaoDoVeiculo"("vigenteDesde");
-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoVeiculo_veiculoId_versao_key" ON "VersaoDoVeiculo"("veiculoId", "versao");
-- CreateIndex
CREATE UNIQUE INDEX "MaquinaDaFrota_ugId_codigo_key" ON "MaquinaDaFrota"("ugId", "codigo");
-- CreateIndex
CREATE INDEX "VersaoDaMaquina_vigenteDesde_idx" ON "VersaoDaMaquina"("vigenteDesde");
-- CreateIndex
CREATE UNIQUE INDEX "VersaoDaMaquina_maquinaId_versao_key" ON "VersaoDaMaquina"("maquinaId", "versao");
-- CreateIndex
CREATE INDEX "MudancaDeSituacaoDaFrota_veiculoId_desde_idx" ON "MudancaDeSituacaoDaFrota"("veiculoId", "desde");
-- CreateIndex
CREATE INDEX "MudancaDeSituacaoDaFrota_maquinaId_desde_idx" ON "MudancaDeSituacaoDaFrota"("maquinaId", "desde");
-- CreateIndex
CREATE UNIQUE INDEX "AnulacaoDeSituacaoDaFrota_mudancaId_key" ON "AnulacaoDeSituacaoDaFrota"("mudancaId");
-- CreateIndex
CREATE INDEX "AbastecimentoDaFrota_veiculoId_data_idx" ON "AbastecimentoDaFrota"("veiculoId", "data");
-- CreateIndex
CREATE INDEX "AbastecimentoDaFrota_maquinaId_data_idx" ON "AbastecimentoDaFrota"("maquinaId", "data");
-- CreateIndex
CREATE UNIQUE INDEX "AnulacaoDeAbastecimento_abastecimentoId_key" ON "AnulacaoDeAbastecimento"("abastecimentoId");
-- CreateIndex
CREATE UNIQUE INDEX "FarmaciaPublica_ugId_codigo_key" ON "FarmaciaPublica"("ugId", "codigo");
-- CreateIndex
CREATE UNIQUE INDEX "VersaoDaFarmacia_farmaciaId_versao_key" ON "VersaoDaFarmacia"("farmaciaId", "versao");
-- CreateIndex
CREATE INDEX "InformeDeEstoqueDaFarmacia_farmaciaId_ano_mes_criadoEm_idx" ON "InformeDeEstoqueDaFarmacia"("farmaciaId", "ano", "mes", "criadoEm");
-- CreateIndex
CREATE UNIQUE INDEX "ItemDoInformeDeEstoque_informeId_codigoProduto_key" ON "ItemDoInformeDeEstoque"("informeId", "codigoProduto");
-- AddForeignKey
ALTER TABLE "VeiculoDaFrota" ADD CONSTRAINT "VeiculoDaFrota_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_locadorId_fkey" FOREIGN KEY ("locadorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MaquinaDaFrota" ADD CONSTRAINT "MaquinaDaFrota_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_locadorId_fkey" FOREIGN KEY ("locadorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MudancaDeSituacaoDaFrota" ADD CONSTRAINT "MudancaDeSituacaoDaFrota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MudancaDeSituacaoDaFrota" ADD CONSTRAINT "MudancaDeSituacaoDaFrota_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AnulacaoDeSituacaoDaFrota" ADD CONSTRAINT "AnulacaoDeSituacaoDaFrota_mudancaId_fkey" FOREIGN KEY ("mudancaId") REFERENCES "MudancaDeSituacaoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AnulacaoDeAbastecimento" ADD CONSTRAINT "AnulacaoDeAbastecimento_abastecimentoId_fkey" FOREIGN KEY ("abastecimentoId") REFERENCES "AbastecimentoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FarmaciaPublica" ADD CONSTRAINT "FarmaciaPublica_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "VersaoDaFarmacia" ADD CONSTRAINT "VersaoDaFarmacia_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InformeDeEstoqueDaFarmacia" ADD CONSTRAINT "InformeDeEstoqueDaFarmacia_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ItemDoInformeDeEstoque" ADD CONSTRAINT "ItemDoInformeDeEstoque_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "InformeDeEstoqueDaFarmacia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECKs (o Prisma não os representa): formato do leiaute e coerência do tipo de frota ──
ALTER TABLE "VeiculoDaFrota" ADD CONSTRAINT "VeiculoDaFrota_placa_check" CHECK ("placa" ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$');
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_renavam_check" CHECK ("renavam" ~ '^[0-9]{11}$');
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_modelo_check" CHECK ("numeroModelo" IS NULL OR "numeroModelo" ~ '^[0-9]{1,6}$');
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_ano_check" CHECK ("anoModelo" BETWEEN 1900 AND 2100);
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_dono_check" CHECK (("tipoFrota" = 'PROPRIO') = ("proprietarioId" IS NULL));
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_locador_check" CHECK (("tipoFrota" IN ('LOCADO', 'PRESTACAO_DE_SERVICOS')) = ("locadorId" IS NOT NULL));
ALTER TABLE "VersaoDoVeiculo" ADD CONSTRAINT "VersaoDoVeiculo_fundamento_check" CHECK (length(trim("fundamento")) >= 5);
ALTER TABLE "MaquinaDaFrota" ADD CONSTRAINT "MaquinaDaFrota_codigo_check" CHECK ("codigo" ~ '^[0-9A-Z]{1,7}$');
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_ano_check" CHECK ("anoFabricacao" BETWEEN 1900 AND 2100);
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_descricao_check" CHECK (length(trim("descricao")) >= 3);
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_dono_check" CHECK (("tipoFrota" = 'PROPRIO') = ("proprietarioId" IS NULL));
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_locador_check" CHECK (("tipoFrota" IN ('LOCADO', 'PRESTACAO_DE_SERVICOS')) = ("locadorId" IS NOT NULL));
ALTER TABLE "VersaoDaMaquina" ADD CONSTRAINT "VersaoDaMaquina_fundamento_check" CHECK (length(trim("fundamento")) >= 5);
ALTER TABLE "MudancaDeSituacaoDaFrota" ADD CONSTRAINT "MudancaDeSituacaoDaFrota_um_bem_check" CHECK (num_nonnulls("veiculoId", "maquinaId") = 1);
ALTER TABLE "MudancaDeSituacaoDaFrota" ADD CONSTRAINT "MudancaDeSituacaoDaFrota_motivo_check" CHECK (length(trim("motivo")) >= 5);
ALTER TABLE "AnulacaoDeSituacaoDaFrota" ADD CONSTRAINT "AnulacaoDeSituacaoDaFrota_motivo_check" CHECK (length(trim("motivo")) >= 5);
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_um_bem_check" CHECK (num_nonnulls("veiculoId", "maquinaId") = 1);
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_quantidade_check" CHECK ("quantidade" > 0);
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_documento_check" CHECK (length(trim("documento")) >= 1);
ALTER TABLE "AnulacaoDeAbastecimento" ADD CONSTRAINT "AnulacaoDeAbastecimento_motivo_check" CHECK (length(trim("motivo")) >= 5);
ALTER TABLE "FarmaciaPublica" ADD CONSTRAINT "FarmaciaPublica_codigo_check" CHECK ("codigo" ~ '^[0-9]{1,7}$');
ALTER TABLE "VersaoDaFarmacia" ADD CONSTRAINT "VersaoDaFarmacia_cpf_check" CHECK ("cpfResponsavel" ~ '^[0-9]{11}$');
ALTER TABLE "VersaoDaFarmacia" ADD CONSTRAINT "VersaoDaFarmacia_crf_check" CHECK (length(trim("crfResponsavel")) >= 1);
ALTER TABLE "VersaoDaFarmacia" ADD CONSTRAINT "VersaoDaFarmacia_fundamento_check" CHECK (length(trim("fundamento")) >= 5);
ALTER TABLE "InformeDeEstoqueDaFarmacia" ADD CONSTRAINT "InformeDeEstoqueDaFarmacia_mes_check" CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
ALTER TABLE "InformeDeEstoqueDaFarmacia" ADD CONSTRAINT "InformeDeEstoqueDaFarmacia_arquivo_check" CHECK (("origem" = 'ARQUIVO') = ("arquivoHash" IS NOT NULL));
ALTER TABLE "ItemDoInformeDeEstoque" ADD CONSTRAINT "ItemDoInformeDeEstoque_produto_check" CHECK ("codigoProduto" ~ '^[0-9]{1,14}$');
ALTER TABLE "ItemDoInformeDeEstoque" ADD CONSTRAINT "ItemDoInformeDeEstoque_quantidade_check" CHECK ("quantidade" >= 0);
