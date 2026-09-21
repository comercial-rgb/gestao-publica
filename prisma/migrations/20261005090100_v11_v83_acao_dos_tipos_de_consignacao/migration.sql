-- V11 V8.3 — a ação do cadastro dos tipos de consignação. Migration própria: `ALTER TYPE ... ADD
-- VALUE` não roda na mesma transação que usa o valor novo.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'GERIR_TIPOS_DE_CONSIGNACAO';
