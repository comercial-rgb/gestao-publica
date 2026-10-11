-- V39-R3 (R3-017, M05) — a acao de registrar e conferir a referencia externa do empenho. Migration propria:
-- `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e criado. Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO';
