-- V22 — o NUMERADOR dos documentos que o sistema numera (folha e encargos), numérico para o SAGRES.
-- Append-only: o runtime recebe INSERT e SELECT, nada de UPDATE/DELETE.

-- CreateTable
CREATE TABLE "NumeroReservado" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "especie" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "NumeroReservado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NumeroReservado_exercicio_especie_chave_key" ON "NumeroReservado"("exercicio", "especie", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "NumeroReservado_exercicio_especie_numero_key" ON "NumeroReservado"("exercicio", "especie", "numero");
