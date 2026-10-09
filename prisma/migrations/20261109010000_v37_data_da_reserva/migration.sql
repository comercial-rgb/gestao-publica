-- V37 (fecha SALDO-NA-DATA-DO-EMPENHO-POR-RESERVA) — a reserva de dotação ganha a data do fato. Aditiva e nula: as
-- reservas anteriores seguem com a competência da gravação.
ALTER TABLE "ReservaDotacao" ADD COLUMN "data" TIMESTAMP(3);
