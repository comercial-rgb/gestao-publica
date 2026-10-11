-- V39-R3 (R3-012, M10) — a aplicacao do ajuste do inventario do almoxarifado (uma por inventario) e o ajuste por
-- contagem com diferenca, ligado ao movimento fisico. Aditiva: duas tabelas novas, append-only, e os CHECKs de
-- prisma/sql/ck_ajuste_do_inventario.sql.
-- CreateTable
CREATE TABLE "AplicacaoDoAjusteDoInventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AplicacaoDoAjusteDoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteDoInventario" (
    "id" TEXT NOT NULL,
    "aplicacaoId" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "quantidadeRegistrada" DECIMAL(18,4) NOT NULL,
    "quantidadeContada" DECIMAL(18,4) NOT NULL,
    "movimentoFisicoId" TEXT NOT NULL,

    CONSTRAINT "AjusteDoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AplicacaoDoAjusteDoInventario_inventarioId_key" ON "AplicacaoDoAjusteDoInventario"("inventarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDoInventario_contagemId_key" ON "AjusteDoInventario"("contagemId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteDoInventario_movimentoFisicoId_key" ON "AjusteDoInventario"("movimentoFisicoId");

-- CreateIndex
CREATE INDEX "AjusteDoInventario_aplicacaoId_idx" ON "AjusteDoInventario"("aplicacaoId");

-- AddForeignKey
ALTER TABLE "AplicacaoDoAjusteDoInventario" ADD CONSTRAINT "AplicacaoDoAjusteDoInventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDoInventario" ADD CONSTRAINT "AjusteDoInventario_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "AplicacaoDoAjusteDoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDoInventario" ADD CONSTRAINT "AjusteDoInventario_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "ContagemDeInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDoInventario" ADD CONSTRAINT "AjusteDoInventario_movimentoFisicoId_fkey" FOREIGN KEY ("movimentoFisicoId") REFERENCES "MovimentoFisicoDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ajuste_do_inventario') THEN
    ALTER TABLE "AjusteDoInventario" ADD CONSTRAINT "ck_ajuste_do_inventario" CHECK ("quantidadeRegistrada" >= 0 AND "quantidadeContada" >= 0 AND "quantidadeRegistrada" <> "quantidadeContada");
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_aplicacao_do_ajuste_do_inventario') THEN
    ALTER TABLE "AplicacaoDoAjusteDoInventario" ADD CONSTRAINT "ck_aplicacao_do_ajuste_do_inventario" CHECK (length(btrim("fundamento")) > 0);
  END IF;
END $$;
