-- V7 M2 U0.2 — O REGIME DE PERÍODO DA MEDIÇÃO, configurado no contrato com fundamento e vigência. Aditiva: as
-- medições existentes não mudam; sem configuração, a medição por itens é identificada pelo saldo por item.
CREATE TYPE "RegimeDePeriodoDaMedicao" AS ENUM ('PERIODO_LIVRE', 'PERIODO_INDIVISIVEL');

CREATE TABLE "RegimeDeMedicaoDoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "regime" "RegimeDePeriodoDaMedicao" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RegimeDeMedicaoDoContrato_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_regime_de_medicao_fundamento" CHECK (length(btrim("fundamento")) >= 5)
);
CREATE INDEX "RegimeDeMedicaoDoContrato_contratoId_vigenciaInicio_idx" ON "RegimeDeMedicaoDoContrato"("contratoId", "vigenciaInicio");
ALTER TABLE "RegimeDeMedicaoDoContrato" ADD CONSTRAINT "RegimeDeMedicaoDoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
