-- CreateTable
CREATE TABLE "ComposicaoDeFontesDaNatureza" (
    "id" TEXT NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteDoResiduoId" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComposicaoDeFontesDaNatureza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaComposicaoDeFontes" (
    "id" TEXT NOT NULL,
    "composicaoId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "exercicioFonte" INTEGER NOT NULL DEFAULT 1,
    "percentual" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "ItemDaComposicaoDeFontes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComposicaoDeFontesDaNatureza_naturezaReceitaId_criadoEm_idx" ON "ComposicaoDeFontesDaNatureza"("naturezaReceitaId", "criadoEm");

-- CreateIndex
CREATE INDEX "ItemDaComposicaoDeFontes_fonteId_idx" ON "ItemDaComposicaoDeFontes"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaComposicaoDeFontes_composicaoId_fonteId_exercicioFont_key" ON "ItemDaComposicaoDeFontes"("composicaoId", "fonteId", "exercicioFonte");

-- AddForeignKey
ALTER TABLE "ComposicaoDeFontesDaNatureza" ADD CONSTRAINT "ComposicaoDeFontesDaNatureza_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComposicaoDeFontesDaNatureza" ADD CONSTRAINT "ComposicaoDeFontesDaNatureza_fonteDoResiduoId_fkey" FOREIGN KEY ("fonteDoResiduoId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaComposicaoDeFontes" ADD CONSTRAINT "ItemDaComposicaoDeFontes_composicaoId_fkey" FOREIGN KEY ("composicaoId") REFERENCES "ComposicaoDeFontesDaNatureza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaComposicaoDeFontes" ADD CONSTRAINT "ItemDaComposicaoDeFontes_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- V36 (TR 5.9.3.4) — percentual entre 0 (exclusive) e 100; exercício da fonte 1 ou 2; fundamento não vazio.
ALTER TABLE "ItemDaComposicaoDeFontes" ADD CONSTRAINT "ItemDaComposicaoDeFontes_percentual_check" CHECK ("percentual" > 0 AND "percentual" <= 100);
ALTER TABLE "ItemDaComposicaoDeFontes" ADD CONSTRAINT "ItemDaComposicaoDeFontes_exercicioFonte_check" CHECK ("exercicioFonte" IN (1, 2));
ALTER TABLE "ComposicaoDeFontesDaNatureza" ADD CONSTRAINT "ComposicaoDeFontesDaNatureza_fundamento_check" CHECK (btrim("fundamento") <> '');
