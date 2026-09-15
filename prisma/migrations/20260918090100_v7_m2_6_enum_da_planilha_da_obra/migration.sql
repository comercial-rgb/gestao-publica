-- V7 M2 U6 — a ação de gerir a planilha orçamentária da obra (valor de enum em migration própria: o PostgreSQL não usa
-- valor novo de enum na mesma transação que o criou).
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_PLANILHA_DA_OBRA';
