-- M05 — identificação bancária estruturada na ContaBancaria (SAGRES M15, S2).
-- ADITIVA PURA: 5 colunas NULLABLE, sem backfill e sem default (doutrina do contaContabilId).
-- Destrava os exporters SAGRES CadastroContaBancaria (§4.23) e SaldoMensal (§4.26), que exigem
-- banco/agência/conta com dígito — o `codigo` interno não bastava.

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN "banco" VARCHAR(3);
ALTER TABLE "ContaBancaria" ADD COLUMN "agencia" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "digitoAgencia" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "conta" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "digitoConta" TEXT;
