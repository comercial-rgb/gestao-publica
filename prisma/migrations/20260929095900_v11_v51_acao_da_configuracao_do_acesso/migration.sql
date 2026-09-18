-- V11 V5.1 — a acao que publica a configuracao do acesso a informacao. Aditiva: um valor de enum.
-- Arquivo proprio pela razao registrada em `20260924090200_v10_t2_acoes_tributarias`: no Postgres o
-- valor novo de um enum so pode ser USADO depois que a transacao que o adicionou commitar.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO';
