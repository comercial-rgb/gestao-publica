-- V5 Fila A — três ações do documento fiscal recebido. SEPARADA das tabelas:
-- ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_DOCUMENTO_FISCAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONFERIR_DOCUMENTO_FISCAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CANCELAR_DOCUMENTO_FISCAL';
