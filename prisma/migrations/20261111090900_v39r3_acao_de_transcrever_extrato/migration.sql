-- V39-R3 (R3-015, M09) — a acao de transcrever e revisar linha de extrato. Migration propria: `ALTER TYPE ... ADD VALUE`
-- nao pode ser usado na mesma transacao em que e criado. Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'TRANSCREVER_EXTRATO';
