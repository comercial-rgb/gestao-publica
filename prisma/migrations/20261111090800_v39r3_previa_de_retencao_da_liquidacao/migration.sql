-- V39-R3 (R3-014, M07) — a previa da retencao guardada na liquidacao (previsao, sem lancamento). Aditiva: uma tabela
-- nova, append-only, e o CHECK de prisma/sql/ck_previa_de_retencao.sql.

-- CreateTable
CREATE TABLE "PreviaDeRetencaoDaLiquidacao" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "valorPrevisto" DECIMAL(15,2) NOT NULL,
    "operacao" JSONB NOT NULL,
    "memoria" JSONB NOT NULL,
    "totalPrevisto" DECIMAL(15,2) NOT NULL,
    "documentoDoFornecedor" TEXT NOT NULL,
    "perfilFiscalId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PreviaDeRetencaoDaLiquidacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreviaDeRetencaoDaLiquidacao_liquidacaoId_versao_key" ON "PreviaDeRetencaoDaLiquidacao"("liquidacaoId", "versao");

-- AddForeignKey
ALTER TABLE "PreviaDeRetencaoDaLiquidacao" ADD CONSTRAINT "PreviaDeRetencaoDaLiquidacao_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_previa_de_retencao') THEN
    ALTER TABLE "PreviaDeRetencaoDaLiquidacao" ADD CONSTRAINT "ck_previa_de_retencao" CHECK ("versao" >= 1 AND "valorPrevisto" > 0 AND "totalPrevisto" >= 0);
  END IF;
END $$;
