-- V39-R3 (R3-015, M09) — a linha de extrato transcrita a mao e a revisao dela. Aditiva: um valor novo em OrigemExtrato,
-- duas tabelas append-only e os CHECKs de prisma/sql/ck_transcricao_de_extrato.sql.

-- CreateEnum
CREATE TYPE "ResultadoDaRevisaoDaTranscricao" AS ENUM ('CONFIRMADA', 'DIVERGENTE');

-- AlterEnum
ALTER TYPE "OrigemExtrato" ADD VALUE 'DIGITADO';

-- CreateTable
CREATE TABLE "TranscricaoDeLinhaDeExtrato" (
    "id" TEXT NOT NULL,
    "lancamentoExtratoId" TEXT NOT NULL,
    "documentoDeSuporte" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TranscricaoDeLinhaDeExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisaoDaTranscricaoDeExtrato" (
    "id" TEXT NOT NULL,
    "transcricaoId" TEXT NOT NULL,
    "resultado" "ResultadoDaRevisaoDaTranscricao" NOT NULL,
    "meio" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RevisaoDaTranscricaoDeExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscricaoDeLinhaDeExtrato_lancamentoExtratoId_key" ON "TranscricaoDeLinhaDeExtrato"("lancamentoExtratoId");

-- CreateIndex
CREATE UNIQUE INDEX "RevisaoDaTranscricaoDeExtrato_transcricaoId_key" ON "RevisaoDaTranscricaoDeExtrato"("transcricaoId");

-- AddForeignKey
ALTER TABLE "TranscricaoDeLinhaDeExtrato" ADD CONSTRAINT "TranscricaoDeLinhaDeExtrato_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "LancamentoExtrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisaoDaTranscricaoDeExtrato" ADD CONSTRAINT "RevisaoDaTranscricaoDeExtrato_transcricaoId_fkey" FOREIGN KEY ("transcricaoId") REFERENCES "TranscricaoDeLinhaDeExtrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transcricao_de_extrato_documento') THEN
    ALTER TABLE "TranscricaoDeLinhaDeExtrato" ADD CONSTRAINT "ck_transcricao_de_extrato_documento" CHECK (length(btrim("documentoDeSuporte")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_revisao_da_transcricao_meio') THEN
    ALTER TABLE "RevisaoDaTranscricaoDeExtrato" ADD CONSTRAINT "ck_revisao_da_transcricao_meio" CHECK (length(btrim("meio")) > 0);
  END IF;
END $$;
