-- V11 V1.1 — as três ações da rubrica versionada. Aditiva: três valores de enum.
-- Arquivo próprio pela razão registrada em `20260924090200_v10_t2_acoes_tributarias`.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CADASTRAR_VERSAO_DE_RUBRICA';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'APROVAR_VERSAO_DE_RUBRICA';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REVOGAR_VERSAO_DE_RUBRICA';
