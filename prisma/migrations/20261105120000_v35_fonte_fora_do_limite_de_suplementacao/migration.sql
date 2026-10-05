-- V35 — fontes fora do limite percentual de suplementação da LOA (Lei 4.320, art. 7º, I). Aditiva.
CREATE TABLE "FonteForaDoLimiteDeSuplementacao" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fonteId" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FonteForaDoLimiteDeSuplementacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FonteForaDoLimiteDeSuplementacao_exercicio_idx" ON "FonteForaDoLimiteDeSuplementacao"("exercicio");

CREATE UNIQUE INDEX "FonteForaDoLimiteDeSuplementacao_exercicio_fonteId_key" ON "FonteForaDoLimiteDeSuplementacao"("exercicio", "fonteId");

ALTER TABLE "FonteForaDoLimiteDeSuplementacao" ADD CONSTRAINT "FonteForaDoLimiteDeSuplementacao_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
