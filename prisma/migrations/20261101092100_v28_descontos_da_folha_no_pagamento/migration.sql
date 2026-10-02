-- V28 — a consignação de cada rubrica de desconto da folha e os descontos retidos no pagamento (aditiva).
-- CreateTable
CREATE TABLE "ConsignacaoDaRubrica" (
    "id" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "tipoConsignacaoId" TEXT NOT NULL,
    "credorConsignatario" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConsignacaoDaRubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescontoDoContrachequeRetido" (
    "id" TEXT NOT NULL,
    "contrachequeId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "geracao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DescontoDoContrachequeRetido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsignacaoDaRubrica_tipoConsignacaoId_idx" ON "ConsignacaoDaRubrica"("tipoConsignacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignacaoDaRubrica_rubricaId_versao_key" ON "ConsignacaoDaRubrica"("rubricaId", "versao");

-- CreateIndex
CREATE INDEX "DescontoDoContrachequeRetido_pagamentoId_idx" ON "DescontoDoContrachequeRetido"("pagamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "DescontoDoContrachequeRetido_contrachequeId_rubricaId_gerac_key" ON "DescontoDoContrachequeRetido"("contrachequeId", "rubricaId", "geracao");

ALTER TABLE "ConsignacaoDaRubrica" ADD CONSTRAINT "ConsignacaoDaRubrica_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsignacaoDaRubrica" ADD CONSTRAINT "ConsignacaoDaRubrica_tipoConsignacaoId_fkey" FOREIGN KEY ("tipoConsignacaoId") REFERENCES "TipoConsignacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DescontoDoContrachequeRetido" ADD CONSTRAINT "DescontoDoContrachequeRetido_contrachequeId_fkey" FOREIGN KEY ("contrachequeId") REFERENCES "Contracheque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DescontoDoContrachequeRetido" ADD CONSTRAINT "DescontoDoContrachequeRetido_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DescontoDoContrachequeRetido" ADD CONSTRAINT "DescontoDoContrachequeRetido_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

