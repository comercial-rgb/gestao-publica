-- M18 — SAGRES Captura 2.0: execução de submissão. ADITIVA (2 enums novos + tabela nova).
CREATE TYPE "ModoCaptura" AS ENUM ('MOCK', 'SANDBOX', 'LIVE');
CREATE TYPE "EstadoCaptura" AS ENUM ('DRAFT', 'VALIDATED_LOCAL', 'REJECTED_LOCAL', 'SUBMITTED_MOCK', 'SIMULATED');
CREATE TABLE "ExecucaoCaptura" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "modo" "ModoCaptura" NOT NULL,
    "estado" "EstadoCaptura" NOT NULL,
    "quantidadeElementos" INTEGER NOT NULL,
    "hashPayload" TEXT NOT NULL,
    "simulationId" TEXT,
    "violacoes" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ExecucaoCaptura_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExecucaoCaptura_correlationId_key" ON "ExecucaoCaptura"("correlationId");
CREATE INDEX "ExecucaoCaptura_entidade_idx" ON "ExecucaoCaptura"("entidade");
CREATE INDEX "ExecucaoCaptura_estado_idx" ON "ExecucaoCaptura"("estado");
