-- V10 T1 (N6.1) — as ações do FORNECEDOR. Aditiva: seis valores de enum, zero DROP.
--
-- ⚠️ ELAS SÃO RESERVADAS. `concederAcaoAoPerfil` (a tela de permissões do ENTE) as RECUSA:
-- o município não concede a si próprio a habilitação comercial. Quem as recebe é o operador
-- do fornecedor, provisionado por ato explícito de instalação
-- (`scripts/provisionar-operador-engine.ts`), nunca por um perfil municipal chamado "admin".
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REGISTRAR_CONTRATO_COMERCIAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ENCERRAR_CONTRATO_COMERCIAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'HABILITAR_MODULO_CONTRATADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PROGRAMAR_VIGENCIA_DE_MODULO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'SUSPENDER_MODULO_CONTRATADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REATIVAR_MODULO_CONTRATADO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CONSULTAR_LICENCIAMENTO';
