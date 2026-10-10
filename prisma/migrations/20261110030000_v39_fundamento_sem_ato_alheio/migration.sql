-- V39-021 (M02, achado da auditoria) — COMPLEMENTO ADITIVO do CHECK do fundamento: na efetivação pela lei aprovada e no
-- ensaio, NENHUM campo do ato da execução provisória pode vir preenchido (o primeiro CHECK só barrava o número).
-- Constraint nova, sem tocar na anterior. O mesmo de prisma/sql/ck_fundamento_sem_ato_alheio.sql.
ALTER TABLE "EfetivacaoDaProposta" ADD CONSTRAINT "ck_fundamento_sem_ato_alheio" CHECK (
  "fundamento" IS NULL
  OR "fundamento" = 'EXECUCAO_PROVISORIA'
  OR ("atoTipo" IS NULL AND "atoNumero" IS NULL AND "atoAno" IS NULL AND "atoDispositivo" IS NULL AND "atoCitacao" IS NULL)
);
