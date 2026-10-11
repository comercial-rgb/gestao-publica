-- V39-R3 (R3-009, R3-010, M37) — a correcao auditavel do item da dispensacao e a troca do deposito da farmacia com
-- vigencia. Aditiva: duas tabelas e dois enums novos, append-only, e os CHECKs de prisma/sql/ck_correcao_da_dispensacao.sql.
-- CreateEnum
CREATE TYPE "TipoDaCorrecaoDaDispensacao" AS ENUM ('CANCELAMENTO_DO_REGISTRO', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "CondicaoDaDevolucao" AS ENUM ('APTO_AO_REUSO', 'INAPTO');

-- CreateTable
CREATE TABLE "CorrecaoDoItemDaDispensacao" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tipo" "TipoDaCorrecaoDaDispensacao" NOT NULL,
    "condicao" "CondicaoDaDevolucao",
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "conferidoPor" TEXT,
    "destino" TEXT,
    "movimentoFisicoId" TEXT,
    "operacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CorrecaoDoItemDaDispensacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrocaDoDepositoDaFarmacia" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "depositoAnteriorId" TEXT NOT NULL,
    "depositoNovoId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TrocaDoDepositoDaFarmacia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorrecaoDoItemDaDispensacao_itemId_key" ON "CorrecaoDoItemDaDispensacao"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CorrecaoDoItemDaDispensacao_movimentoFisicoId_key" ON "CorrecaoDoItemDaDispensacao"("movimentoFisicoId");

-- CreateIndex
CREATE INDEX "CorrecaoDoItemDaDispensacao_operacaoId_idx" ON "CorrecaoDoItemDaDispensacao"("operacaoId");

-- CreateIndex
CREATE INDEX "TrocaDoDepositoDaFarmacia_depositoNovoId_idx" ON "TrocaDoDepositoDaFarmacia"("depositoNovoId");

-- CreateIndex
CREATE UNIQUE INDEX "TrocaDoDepositoDaFarmacia_farmaciaId_vigenteDesde_key" ON "TrocaDoDepositoDaFarmacia"("farmaciaId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "CorrecaoDoItemDaDispensacao" ADD CONSTRAINT "CorrecaoDoItemDaDispensacao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDaDispensacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoDoItemDaDispensacao" ADD CONSTRAINT "CorrecaoDoItemDaDispensacao_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrocaDoDepositoDaFarmacia" ADD CONSTRAINT "TrocaDoDepositoDaFarmacia_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrocaDoDepositoDaFarmacia" ADD CONSTRAINT "TrocaDoDepositoDaFarmacia_depositoAnteriorId_fkey" FOREIGN KEY ("depositoAnteriorId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrocaDoDepositoDaFarmacia" ADD CONSTRAINT "TrocaDoDepositoDaFarmacia_depositoNovoId_fkey" FOREIGN KEY ("depositoNovoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_correcao_do_item_da_dispensacao') THEN
    ALTER TABLE "CorrecaoDoItemDaDispensacao" ADD CONSTRAINT "ck_correcao_do_item_da_dispensacao" CHECK (
      length(btrim("motivo")) > 0 AND (
        ("tipo" = 'CANCELAMENTO_DO_REGISTRO' AND "condicao" IS NULL AND "destino" IS NULL AND "movimentoFisicoId" IS NOT NULL)
        OR ("tipo" = 'DEVOLUCAO' AND "conferidoPor" IS NOT NULL AND length(btrim("conferidoPor")) > 0 AND (
          ("condicao" = 'APTO_AO_REUSO' AND "movimentoFisicoId" IS NOT NULL AND "destino" IS NULL)
          OR ("condicao" = 'INAPTO' AND "movimentoFisicoId" IS NULL AND "destino" IS NOT NULL AND length(btrim("destino")) > 0)))));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_troca_do_deposito_da_farmacia') THEN
    ALTER TABLE "TrocaDoDepositoDaFarmacia" ADD CONSTRAINT "ck_troca_do_deposito_da_farmacia" CHECK ("depositoAnteriorId" <> "depositoNovoId" AND length(btrim("fundamento")) > 0);
  END IF;
END $$;
