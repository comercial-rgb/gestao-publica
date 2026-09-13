-- V5 — a chave de acesso, quando existe, identifica o documento no escopo do ente.
-- Nulos repetidos são permitidos (NFC-e sem chave, recibo, digitação). Prisma não
-- expressa índice parcial.
CREATE UNIQUE INDEX uq_documento_fiscal_chave
  ON "DocumentoFiscalRecebido" ("chaveAcesso")
  WHERE "chaveAcesso" IS NOT NULL;
