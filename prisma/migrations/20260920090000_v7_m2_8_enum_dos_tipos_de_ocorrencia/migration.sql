-- V7 M2 U8 — a ação de gerir os tipos de ocorrência do ente (valor de enum em migration própria: o PostgreSQL não usa
-- valor novo de enum na mesma transação que o criou).
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_TIPOS_DE_OCORRENCIA';
