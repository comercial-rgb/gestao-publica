-- V11 V8 — as três ações da agenda do guichê.
--
-- ⚠️ MIGRATION PRÓPRIA, como toda adição de valor a enum no Postgres: `ALTER TYPE ... ADD VALUE`
-- não pode rodar na mesma transação que usa o valor novo.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CONFIGURAR_AGENDA_DO_GUICHE';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'RESERVAR_ATENDIMENTO_NO_GUICHE';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REGISTRAR_ATENDIMENTO_NO_GUICHE';
