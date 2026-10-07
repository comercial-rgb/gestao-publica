-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "numero" VARCHAR(15) NOT NULL,
    "origem" VARCHAR(10) NOT NULL,
    "pagamentoId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "favorecido" TEXT,
    "finalidade" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDeCheque" (
    "id" TEXT NOT NULL,
    "chequeId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancelamentoDeCheque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_pagamentoId_key" ON "Cheque"("pagamentoId");

-- CreateIndex
CREATE INDEX "Cheque_data_idx" ON "Cheque"("data");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_contaBancariaId_numero_key" ON "Cheque"("contaBancariaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDeCheque_chequeId_key" ON "CancelamentoDeCheque"("chequeId");

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDeCheque" ADD CONSTRAINT "CancelamentoDeCheque_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- V36 (TR 5.10.2.42) — cada origem com os seus campos; valor de face positivo; número sem espaço nas pontas.
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_origem_check" CHECK (
  ("origem" = 'PAGAMENTO' AND "pagamentoId" IS NOT NULL AND "favorecido" IS NULL AND "finalidade" IS NULL)
  OR ("origem" = 'AVULSO' AND "pagamentoId" IS NULL AND "favorecido" IS NOT NULL AND "finalidade" IS NOT NULL)
);
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_valor_check" CHECK ("valor" > 0);
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_numero_check" CHECK ("numero" = btrim("numero") AND "numero" <> '');
