-- V26 — a memória do cálculo da retenção própria (IR de PJ e ISS do município) junto do elo pagamento →
-- receita. Aditiva: colunas novas, nulas, numa tabela criada nesta mesma rodada. A trava de
-- "CalculoDaRetencao" (retido exige movimento de consignação) continua como está.
ALTER TABLE "RetencaoPropriaDoPagamento" ADD COLUMN "base" DECIMAL(15,2);
ALTER TABLE "RetencaoPropriaDoPagamento" ADD COLUMN "aliquota" DECIMAL(9,6);
ALTER TABLE "RetencaoPropriaDoPagamento" ADD COLUMN "fundamento" TEXT;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD COLUMN "entrada" JSONB;
