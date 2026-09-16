-- V7 B1 — as ações do cadastro imobiliário e dos parâmetros do tributo (valores de enum em migration própria: o
-- PostgreSQL não usa valor novo de enum na mesma transação que o criou).
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_CADASTRO_IMOBILIARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_PARAMETROS_TRIBUTARIOS';
