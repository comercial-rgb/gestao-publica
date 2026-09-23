-- V11 V9 — as três ações da entidade contábil. Migration PRÓPRIA, pelo mesmo motivo da V8.3:
-- `ALTER TYPE ... ADD VALUE` não roda na mesma transação que usa o valor novo.
--
-- Três AÇÕES para quatro SERVIÇOS: `publicarVersaoDaEntidadeContabil` fica sob
-- `CADASTRAR_ENTIDADE_CONTABIL` porque é a mesma autoridade — dizer quem a entidade é.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CADASTRAR_ENTIDADE_CONTABIL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DECLARAR_TITULAR_DA_CONTA_BANCARIA';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ATRIBUIR_ENTIDADE_A_ARRECADACAO';
