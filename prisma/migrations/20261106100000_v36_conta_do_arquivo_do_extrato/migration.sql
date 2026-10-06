-- V36 — o banco e a conta que o arquivo do extrato informa (BANKID e ACCTID do OFX).
-- Aditiva: duas colunas nulas, sem backfill (o extrato antigo nao declarava), e um indice.

ALTER TABLE "ExtratoBancario" ADD COLUMN "bancoDoArquivo" TEXT;
ALTER TABLE "ExtratoBancario" ADD COLUMN "contaDoArquivo" TEXT;

CREATE INDEX "ExtratoBancario_contaDoArquivo_idx" ON "ExtratoBancario"("contaDoArquivo");
