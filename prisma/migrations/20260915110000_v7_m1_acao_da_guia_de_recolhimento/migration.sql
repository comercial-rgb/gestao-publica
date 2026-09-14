-- V7 M1 U3.2 — registrar, baixar e cancelar a GUIA DE RECOLHIMENTO fornecida pelo emissor.
-- SEPARADA das tabelas: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_GUIA_DE_RECOLHIMENTO';
