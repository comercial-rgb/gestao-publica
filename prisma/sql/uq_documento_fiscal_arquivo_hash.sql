-- V5 — o hash do arquivo original complementa a identidade (reimportação do mesmo
-- XML). Não substitui emitente+modelo+série+número. Nulos repetidos (digitação) ok.
CREATE UNIQUE INDEX uq_documento_fiscal_arquivo_hash
  ON "DocumentoFiscalRecebido" ("arquivoHash")
  WHERE "arquivoHash" IS NOT NULL;
