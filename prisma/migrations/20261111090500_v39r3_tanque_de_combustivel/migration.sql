-- V39-R3 (R3-018, M36) — o tanque proprio de combustivel (um deposito do almoxarifado com o combustivel e a
-- capacidade) e o abastecimento interno ligado a saida fisica do tanque. Aditiva: uma tabela, duas colunas anulaveis
-- e os CHECKs de prisma/sql/ck_tanque_de_combustivel.sql.

-- AlterTable
ALTER TABLE "AbastecimentoDaFrota" ADD COLUMN     "movimentoFisicoId" TEXT,
ADD COLUMN     "tanqueId" TEXT;

-- CreateTable
CREATE TABLE "TanqueDeCombustivel" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "combustivel" "CombustivelDaFrota" NOT NULL,
    "capacidade" DECIMAL(15,2) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TanqueDeCombustivel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TanqueDeCombustivel_codigo_key" ON "TanqueDeCombustivel"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "TanqueDeCombustivel_depositoId_key" ON "TanqueDeCombustivel"("depositoId");

-- CreateIndex
CREATE INDEX "TanqueDeCombustivel_materialId_idx" ON "TanqueDeCombustivel"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "AbastecimentoDaFrota_movimentoFisicoId_key" ON "AbastecimentoDaFrota"("movimentoFisicoId");

-- AddForeignKey
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_tanqueId_fkey" FOREIGN KEY ("tanqueId") REFERENCES "TanqueDeCombustivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "AbastecimentoDaFrota_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanqueDeCombustivel" ADD CONSTRAINT "TanqueDeCombustivel_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanqueDeCombustivel" ADD CONSTRAINT "TanqueDeCombustivel_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tanque_de_combustivel') THEN
    ALTER TABLE "TanqueDeCombustivel" ADD CONSTRAINT "ck_tanque_de_combustivel" CHECK ("capacidade" > 0 AND length(btrim("fundamento")) > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_abastecimento_do_tanque') THEN
    ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "ck_abastecimento_do_tanque" CHECK (("tanqueId" IS NULL) = ("movimentoFisicoId" IS NULL));
  END IF;
END $$;
