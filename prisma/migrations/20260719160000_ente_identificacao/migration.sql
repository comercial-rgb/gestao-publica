-- M14/M15 (S6) — identificação institucional do ente (ordenador + contador). ADITIVA: colunas nullable.
ALTER TABLE "EnteConfig" ADD COLUMN "nomeOrdenador" TEXT;
ALTER TABLE "EnteConfig" ADD COLUMN "cpfOrdenador" VARCHAR(11);
ALTER TABLE "EnteConfig" ADD COLUMN "nomeContador" TEXT;
ALTER TABLE "EnteConfig" ADD COLUMN "cpfContador" VARCHAR(11);
ALTER TABLE "EnteConfig" ADD COLUMN "crcContador" TEXT;
