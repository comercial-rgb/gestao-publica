-- V6 P1.2 — a ação de atribuir conta bancária a uma arrecadação do legado. SEPARADA da tabela:
-- ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ATRIBUIR_CONTA_A_ARRECADACAO';
