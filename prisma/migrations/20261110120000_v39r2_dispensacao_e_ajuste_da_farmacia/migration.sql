-- V39-R2 (R2-030/031, M37) — o deposito da farmacia, a dispensacao com os itens e o ajuste (perda ou sobra). Aditiva:
-- quatro tabelas novas, append-only, e os CHECKs de prisma/sql/ck_ajuste_da_farmacia.sql.
-- CreateEnum
CREATE TYPE "SentidoDoAjusteDaFarmacia" AS ENUM ('PERDA', 'SOBRA');

-- CreateTable
CREATE TABLE "DepositoDaFarmacia" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DepositoDaFarmacia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispensacaoDeMedicamento" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "identificacaoDoUsuario" VARCHAR(40) NOT NULL,
    "receita" VARCHAR(120) NOT NULL,
    "prescritor" VARCHAR(120) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DispensacaoDeMedicamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaDispensacao" (
    "id" TEXT NOT NULL,
    "dispensacaoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "movimentoFisicoId" TEXT NOT NULL,

    CONSTRAINT "ItemDaDispensacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteDaFarmacia" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "sentido" "SentidoDoAjusteDaFarmacia" NOT NULL,
    "materialId" TEXT NOT NULL,
    "loteId" TEXT,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "destino" TEXT,
    "inventarioId" TEXT,
    "movimentoFisicoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AjusteDaFarmacia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositoDaFarmacia_farmaciaId_key" ON "DepositoDaFarmacia"("farmaciaId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositoDaFarmacia_depositoId_key" ON "DepositoDaFarmacia"("depositoId");

-- CreateIndex
CREATE INDEX "DispensacaoDeMedicamento_farmaciaId_data_idx" ON "DispensacaoDeMedicamento"("farmaciaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DispensacaoDeMedicamento_farmaciaId_numero_key" ON "DispensacaoDeMedicamento"("farmaciaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaDispensacao_movimentoFisicoId_key" ON "ItemDaDispensacao"("movimentoFisicoId");

-- CreateIndex
CREATE INDEX "ItemDaDispensacao_dispensacaoId_idx" ON "ItemDaDispensacao"("dispensacaoId");

-- CreateIndex
CREATE INDEX "ItemDaDispensacao_materialId_idx" ON "ItemDaDispensacao"("materialId");

-- CreateIndex
CREATE INDEX "ItemDaDispensacao_loteId_idx" ON "ItemDaDispensacao"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDaFarmacia_movimentoFisicoId_key" ON "AjusteDaFarmacia"("movimentoFisicoId");

-- CreateIndex
CREATE INDEX "AjusteDaFarmacia_farmaciaId_data_idx" ON "AjusteDaFarmacia"("farmaciaId", "data");

-- AddForeignKey
ALTER TABLE "DepositoDaFarmacia" ADD CONSTRAINT "DepositoDaFarmacia_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositoDaFarmacia" ADD CONSTRAINT "DepositoDaFarmacia_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensacaoDeMedicamento" ADD CONSTRAINT "DispensacaoDeMedicamento_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ItemDaDispensacao_dispensacaoId_fkey" FOREIGN KEY ("dispensacaoId") REFERENCES "DispensacaoDeMedicamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ItemDaDispensacao_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ItemDaDispensacao_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ItemDaDispensacao_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "AjusteDaFarmacia_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "AjusteDaFarmacia_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "AjusteDaFarmacia_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDeMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "AjusteDaFarmacia_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "AjusteDaFarmacia_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs (os mesmos de prisma/sql/ck_ajuste_da_farmacia.sql)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ajuste_da_farmacia') THEN
    ALTER TABLE "AjusteDaFarmacia" ADD CONSTRAINT "ck_ajuste_da_farmacia" CHECK ("quantidade" > 0 AND (("sentido" = 'SOBRA' AND "destino" IS NULL) OR ("sentido" = 'PERDA' AND "destino" IS NOT NULL AND length(btrim("destino")) > 0)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_da_dispensacao') THEN
    ALTER TABLE "ItemDaDispensacao" ADD CONSTRAINT "ck_item_da_dispensacao" CHECK ("quantidade" > 0);
  END IF;
END $$;
