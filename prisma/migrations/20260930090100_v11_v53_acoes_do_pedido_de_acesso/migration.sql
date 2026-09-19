-- V11 V5.3 — AS CINCO AÇÕES DO RITO DO ACESSO À INFORMAÇÃO.
--
-- ⚠️ ARQUIVO PRÓPRIO, E ISSO NÃO É ORGANIZAÇÃO — É EXIGÊNCIA DO POSTGRES. Um valor novo de
-- enum só pode ser USADO depois que a transação que o adicionou tiver commitado. Juntar
-- `ALTER TYPE ... ADD VALUE` com qualquer coisa que o referencie na mesma migration falha
-- com "unsafe use of new value of enum type".
--
-- IF NOT EXISTS: a migration é idempotente por reexecução em banco que já a recebeu.

ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO';
