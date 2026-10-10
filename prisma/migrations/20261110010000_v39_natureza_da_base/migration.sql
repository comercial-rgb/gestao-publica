-- V39-001/002 (M16) — A NATUREZA DA BASE: a declaração, no banco, de que a base é OFICIAL, de DEMONSTRAÇÃO ou de
-- ENSAIO. Aditiva: uma tabela nova, append-only (o runtime só insere e lê). O conjunto é fechado pelo CHECK.
-- CreateTable
CREATE TABLE "DeclaracaoDaNaturezaDaBase" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "natureza" VARCHAR(20) NOT NULL,
    "motivo" TEXT NOT NULL,
    "declaradoPor" TEXT NOT NULL,
    "declaradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclaracaoDaNaturezaDaBase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeclaracaoDaNaturezaDaBase_numero_key" ON "DeclaracaoDaNaturezaDaBase"("numero");

-- O conjunto fechado e o motivo não vazio.
ALTER TABLE "DeclaracaoDaNaturezaDaBase" ADD CONSTRAINT "ck_natureza_da_base_conjunto"
  CHECK ("natureza" IN ('OFICIAL', 'DEMONSTRACAO', 'ENSAIO') AND length(btrim("motivo")) > 0 AND "numero" > 0);
