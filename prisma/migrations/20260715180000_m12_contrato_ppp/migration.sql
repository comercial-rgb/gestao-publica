-- M12 — Contrato de PPP (RREO Anexo 13). Aditiva: só cria a tabela ContratoPPP.
-- Nenhuma coluna existente tocada. Layout completo da Tabela 13 = pendência de dado (MODULO).

-- CreateTable
CREATE TABLE "ContratoPPP" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "parceiroPrivado" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "valorGlobal" DECIMAL(18,2) NOT NULL,
    "contraprestacaoAnual" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoPPP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContratoPPP_vigenciaInicio_vigenciaFim_idx" ON "ContratoPPP"("vigenciaInicio", "vigenciaFim");
