-- V11 V4.2 — as tres acoes da politica de publicacao de pessoal. Aditiva: tres valores de enum.
-- Arquivo proprio pela razao registrada em `20260924090200_v10_t2_acoes_tributarias`: no Postgres
-- o valor novo de um enum so pode ser USADO depois que a transacao que o adicionou commitar.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CADASTRAR_POLITICA_DE_PESSOAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'APROVAR_POLITICA_DE_PESSOAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REVOGAR_POLITICA_DE_PESSOAL';
