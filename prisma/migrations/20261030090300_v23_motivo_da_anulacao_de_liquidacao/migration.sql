-- V23 — o MOTIVO da anulação de liquidação (SAGRES §4.11, EstornoLiquidacao: obrigatório, até 120).
--
-- Aditiva e nula, como a do pagamento (V21): só as linhas de ANULAÇÃO (inteira ou parcial) recebem
-- motivo; a liquidação genuína não tem, e as anulações gravadas antes ficam sem. A tela sempre exigiu
-- o texto; o serviço o descartava antes do banco.
ALTER TABLE "Liquidacao" ADD COLUMN "motivo" TEXT;
