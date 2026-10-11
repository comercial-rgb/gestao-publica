-- V39-R2 (R2-025 a 028, M36) — condutor e habilitacao, exigencia de categoria do bem, ordem de abastecimento (e a
-- coluna anulavel ordemId no abastecimento), leitura do marcador e manutencao com autorizacao, conclusao e cancelamento.
-- Aditiva: tabelas novas, uma coluna anulavel e os CHECKs de prisma/sql/ck_operacao_da_frota.sql.
-- CreateEnum
CREATE TYPE "TipoDeManutencaoDaFrota" AS ENUM ('PREVENTIVA', 'CORRETIVA');

-- AlterTable
ALTER TABLE "AbastecimentoDaFrota" ADD COLUMN     "ordemId" TEXT;

-- CreateTable
CREATE TABLE "CondutorDaFrota" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "matricula" VARCHAR(20) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CondutorDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoCondutor" (
    "id" TEXT NOT NULL,
    "condutorId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "cnhNumero" VARCHAR(11) NOT NULL,
    "cnhCategoria" VARCHAR(2) NOT NULL,
    "cnhValidade" TIMESTAMP(3) NOT NULL,
    "vinculo" VARCHAR(60) NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoCondutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExigenciaDeHabilitacaoDaFrota" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "categoriasAceitas" TEXT[],
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ExigenciaDeHabilitacaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeAbastecimento" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "condutorId" TEXT NOT NULL,
    "combustivel" "CombustivelDaFrota" NOT NULL,
    "quantidadeAutorizada" DECIMAL(15,2) NOT NULL,
    "emitidaEm" TIMESTAMP(3) NOT NULL,
    "validaAte" TIMESTAMP(3) NOT NULL,
    "local" VARCHAR(120) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "OrdemDeAbastecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDaOrdemDeAbastecimento" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CancelamentoDaOrdemDeAbastecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeituraDoMarcadorDaFrota" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,1) NOT NULL,
    "abastecimentoId" TEXT,
    "corrigeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LeituraDoMarcadorDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoDaFrota" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "veiculoId" TEXT,
    "maquinaId" TEXT,
    "tipo" "TipoDeManutencaoDaFrota" NOT NULL,
    "descricao" TEXT NOT NULL,
    "solicitante" VARCHAR(80) NOT NULL,
    "dataDoPedido" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ManutencaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutorizacaoDaManutencaoDaFrota" (
    "id" TEXT NOT NULL,
    "manutencaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "contratoId" TEXT,
    "fornecedor" VARCHAR(120) NOT NULL,
    "valorEstimado" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AutorizacaoDaManutencaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConclusaoDaManutencaoDaFrota" (
    "id" TEXT NOT NULL,
    "manutencaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "custo" DECIMAL(18,2) NOT NULL,
    "documento" VARCHAR(120) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConclusaoDaManutencaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDaManutencaoDaFrota" (
    "id" TEXT NOT NULL,
    "manutencaoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CancelamentoDaManutencaoDaFrota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CondutorDaFrota_matricula_key" ON "CondutorDaFrota"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoCondutor_condutorId_versao_key" ON "VersaoDoCondutor"("condutorId", "versao");

-- CreateIndex
CREATE INDEX "ExigenciaDeHabilitacaoDaFrota_veiculoId_vigenteDesde_idx" ON "ExigenciaDeHabilitacaoDaFrota"("veiculoId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "ExigenciaDeHabilitacaoDaFrota_maquinaId_vigenteDesde_idx" ON "ExigenciaDeHabilitacaoDaFrota"("maquinaId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeAbastecimento_numero_key" ON "OrdemDeAbastecimento"("numero");

-- CreateIndex
CREATE INDEX "OrdemDeAbastecimento_veiculoId_emitidaEm_idx" ON "OrdemDeAbastecimento"("veiculoId", "emitidaEm");

-- CreateIndex
CREATE INDEX "OrdemDeAbastecimento_maquinaId_emitidaEm_idx" ON "OrdemDeAbastecimento"("maquinaId", "emitidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDaOrdemDeAbastecimento_ordemId_key" ON "CancelamentoDaOrdemDeAbastecimento"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "LeituraDoMarcadorDaFrota_abastecimentoId_key" ON "LeituraDoMarcadorDaFrota"("abastecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "LeituraDoMarcadorDaFrota_corrigeId_key" ON "LeituraDoMarcadorDaFrota"("corrigeId");

-- CreateIndex
CREATE INDEX "LeituraDoMarcadorDaFrota_veiculoId_data_idx" ON "LeituraDoMarcadorDaFrota"("veiculoId", "data");

-- CreateIndex
CREATE INDEX "LeituraDoMarcadorDaFrota_maquinaId_data_idx" ON "LeituraDoMarcadorDaFrota"("maquinaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ManutencaoDaFrota_numero_key" ON "ManutencaoDaFrota"("numero");

-- CreateIndex
CREATE INDEX "ManutencaoDaFrota_veiculoId_dataDoPedido_idx" ON "ManutencaoDaFrota"("veiculoId", "dataDoPedido");

-- CreateIndex
CREATE INDEX "ManutencaoDaFrota_maquinaId_dataDoPedido_idx" ON "ManutencaoDaFrota"("maquinaId", "dataDoPedido");

-- CreateIndex
CREATE UNIQUE INDEX "AutorizacaoDaManutencaoDaFrota_manutencaoId_key" ON "AutorizacaoDaManutencaoDaFrota"("manutencaoId");

-- CreateIndex
CREATE INDEX "AutorizacaoDaManutencaoDaFrota_contratoId_idx" ON "AutorizacaoDaManutencaoDaFrota"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConclusaoDaManutencaoDaFrota_manutencaoId_key" ON "ConclusaoDaManutencaoDaFrota"("manutencaoId");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDaManutencaoDaFrota_manutencaoId_key" ON "CancelamentoDaManutencaoDaFrota"("manutencaoId");

-- CreateIndex
CREATE INDEX "AbastecimentoDaFrota_ordemId_idx" ON "AbastecimentoDaFrota"("ordemId");

-- AddForeignKey
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeAbastecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoDoCondutor" ADD CONSTRAINT "VersaoDoCondutor_condutorId_fkey" FOREIGN KEY ("condutorId") REFERENCES "CondutorDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExigenciaDeHabilitacaoDaFrota" ADD CONSTRAINT "ExigenciaDeHabilitacaoDaFrota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExigenciaDeHabilitacaoDaFrota" ADD CONSTRAINT "ExigenciaDeHabilitacaoDaFrota_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeAbastecimento" ADD CONSTRAINT "OrdemDeAbastecimento_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeAbastecimento" ADD CONSTRAINT "OrdemDeAbastecimento_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeAbastecimento" ADD CONSTRAINT "OrdemDeAbastecimento_condutorId_fkey" FOREIGN KEY ("condutorId") REFERENCES "CondutorDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDaOrdemDeAbastecimento" ADD CONSTRAINT "CancelamentoDaOrdemDeAbastecimento_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeAbastecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "LeituraDoMarcadorDaFrota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "LeituraDoMarcadorDaFrota_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "LeituraDoMarcadorDaFrota_abastecimentoId_fkey" FOREIGN KEY ("abastecimentoId") REFERENCES "AbastecimentoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "LeituraDoMarcadorDaFrota_corrigeId_fkey" FOREIGN KEY ("corrigeId") REFERENCES "LeituraDoMarcadorDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoDaFrota" ADD CONSTRAINT "ManutencaoDaFrota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoDaFrota" ADD CONSTRAINT "ManutencaoDaFrota_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "MaquinaDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacaoDaManutencaoDaFrota" ADD CONSTRAINT "AutorizacaoDaManutencaoDaFrota_manutencaoId_fkey" FOREIGN KEY ("manutencaoId") REFERENCES "ManutencaoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacaoDaManutencaoDaFrota" ADD CONSTRAINT "AutorizacaoDaManutencaoDaFrota_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConclusaoDaManutencaoDaFrota" ADD CONSTRAINT "ConclusaoDaManutencaoDaFrota_manutencaoId_fkey" FOREIGN KEY ("manutencaoId") REFERENCES "ManutencaoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDaManutencaoDaFrota" ADD CONSTRAINT "CancelamentoDaManutencaoDaFrota_manutencaoId_fkey" FOREIGN KEY ("manutencaoId") REFERENCES "ManutencaoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs (os mesmos de prisma/sql/ck_operacao_da_frota.sql)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_versao_do_condutor') THEN
    ALTER TABLE "VersaoDoCondutor" ADD CONSTRAINT "ck_versao_do_condutor" CHECK ("versao" >= 1 AND "cnhCategoria" ~ '^(A|B|C|D|E|AB|AC|AD|AE)$');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_exigencia_de_habilitacao_um_bem') THEN
    ALTER TABLE "ExigenciaDeHabilitacaoDaFrota" ADD CONSTRAINT "ck_exigencia_de_habilitacao_um_bem" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND cardinality("categoriasAceitas") >= 1);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ordem_de_abastecimento') THEN
    ALTER TABLE "OrdemDeAbastecimento" ADD CONSTRAINT "ck_ordem_de_abastecimento" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND "quantidadeAutorizada" > 0 AND "validaAte" >= "emitidaEm");
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_leitura_do_marcador') THEN
    ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "ck_leitura_do_marcador" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND "valor" >= 0 AND ("corrigeId" IS NULL OR ("motivo" IS NOT NULL AND length(btrim("motivo")) > 0)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_manutencao_da_frota_um_bem') THEN
    ALTER TABLE "ManutencaoDaFrota" ADD CONSTRAINT "ck_manutencao_da_frota_um_bem" CHECK (("veiculoId" IS NULL) <> ("maquinaId" IS NULL));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_valores_da_manutencao') THEN
    ALTER TABLE "AutorizacaoDaManutencaoDaFrota" ADD CONSTRAINT "ck_valores_da_manutencao" CHECK ("valorEstimado" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_custo_da_manutencao') THEN
    ALTER TABLE "ConclusaoDaManutencaoDaFrota" ADD CONSTRAINT "ck_custo_da_manutencao" CHECK ("custo" >= 0);
  END IF;
END $$;
