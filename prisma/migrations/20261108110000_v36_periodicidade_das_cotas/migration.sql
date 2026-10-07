-- V36 — a periodicidade do controle das cotas de despesa (TR 5.9.3.33). Aditiva: uma tabela, append-only.

-- CreateTable
CREATE TABLE "PeriodicidadeDasCotasCmd" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "periodicidade" VARCHAR(10) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "atoRef" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PeriodicidadeDasCotasCmd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodicidadeDasCotasCmd_exercicio_vigenteDesde_idx" ON "PeriodicidadeDasCotasCmd"("exercicio", "vigenteDesde");


ALTER TABLE "PeriodicidadeDasCotasCmd" ADD CONSTRAINT "PeriodicidadeDasCotasCmd_periodicidade_check" CHECK ("periodicidade" IN ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL'));
