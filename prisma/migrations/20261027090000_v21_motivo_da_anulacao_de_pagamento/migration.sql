-- V21 — o MOTIVO da anulação de pagamento (SAGRES §4.13, EstornoPagamento: obrigatório, até 120).
--
-- Aditiva e nula: só as linhas de ANULAÇÃO (inteira ou parcial) recebem motivo; o pagamento genuíno
-- não tem, e as anulações gravadas antes desta migration ficam sem — inventar um motivo retroativo
-- seria pior que não ter nenhum. A tela sempre exigiu o texto; o serviço o descartava antes do banco.
ALTER TABLE "Pagamento" ADD COLUMN "motivo" TEXT;
