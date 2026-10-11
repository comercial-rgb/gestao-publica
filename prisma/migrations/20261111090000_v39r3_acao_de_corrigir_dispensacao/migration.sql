-- V39-R3 (R3-009, M37) — a acao de corrigir a dispensacao (cancelar o registro incorreto ou receber a devolucao).
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e criado. Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CORRIGIR_DISPENSACAO_DE_MEDICAMENTO';
