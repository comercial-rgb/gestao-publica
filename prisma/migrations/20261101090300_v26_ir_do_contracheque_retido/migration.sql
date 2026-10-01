-- V26 — o IR de cada contracheque retido num pagamento da folha: a ligação folha → pagamento → retenção → receita.
-- Aditiva: uma tabela nova.

CREATE TABLE "IrDoContrachequeRetido" (
    "id" TEXT NOT NULL,
    "contrachequeId" TEXT NOT NULL,
    "retencaoPropriaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "IrDoContrachequeRetido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IrDoContrachequeRetido_retencaoPropriaId_idx" ON "IrDoContrachequeRetido"("retencaoPropriaId");
CREATE UNIQUE INDEX "IrDoContrachequeRetido_contrachequeId_retencaoPropriaId_key" ON "IrDoContrachequeRetido"("contrachequeId", "retencaoPropriaId");
ALTER TABLE "IrDoContrachequeRetido" ADD CONSTRAINT "IrDoContrachequeRetido_contrachequeId_fkey" FOREIGN KEY ("contrachequeId") REFERENCES "Contracheque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IrDoContrachequeRetido" ADD CONSTRAINT "IrDoContrachequeRetido_retencaoPropriaId_fkey" FOREIGN KEY ("retencaoPropriaId") REFERENCES "RetencaoPropriaDoPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IrDoContrachequeRetido" ADD CONSTRAINT "IrDoContrachequeRetido_valor_check" CHECK ("valor" > 0);
