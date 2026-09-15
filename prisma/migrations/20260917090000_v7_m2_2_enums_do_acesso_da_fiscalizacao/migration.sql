-- V7 M2 (ponte contratual) U0.1 — a definição do administrador da fiscalização e o papel de quem recebe
-- definitivamente. SEPARADA das tabelas: um valor novo de enum não é usável na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO';
ALTER TYPE "PapelNoContrato" ADD VALUE 'RECEBEDOR_DEFINITIVO';
