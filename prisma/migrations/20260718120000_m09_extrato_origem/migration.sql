-- M09 — origem do extrato (OFX × API do Banco do Brasil, M17-a).
-- ADITIVA: cria um enum NOVO e adiciona a coluna com default OFX. (Criar um tipo novo e usá-lo na
-- mesma migração é permitido — a restrição do Postgres é só para ADD VALUE a um enum EXISTENTE.)

-- CreateEnum
CREATE TYPE "OrigemExtrato" AS ENUM ('OFX', 'API_BB');

-- AlterTable
ALTER TABLE "ExtratoBancario" ADD COLUMN "origem" "OrigemExtrato" NOT NULL DEFAULT 'OFX';
