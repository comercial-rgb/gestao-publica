-- V26 — a licitação como está cadastrada no Tramita do TCE-PB (SAGRES §4.8 e §4.38). Aditiva: uma tabela nova.

CREATE TABLE "IdentificacaoNoTramita" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "numeroNoTramita" VARCHAR(9) NOT NULL,
    "codUnidadeGestora" VARCHAR(6) NOT NULL,
    "modalidadeSagres" VARCHAR(2) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "IdentificacaoNoTramita_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdentificacaoNoTramita_processoId_criadoEm_idx" ON "IdentificacaoNoTramita"("processoId", "criadoEm");
ALTER TABLE "IdentificacaoNoTramita" ADD CONSTRAINT "IdentificacaoNoTramita_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdentificacaoNoTramita" ADD CONSTRAINT "IdentificacaoNoTramita_ug_check" CHECK ("codUnidadeGestora" ~ '^[0-9]{6}$');
ALTER TABLE "IdentificacaoNoTramita" ADD CONSTRAINT "IdentificacaoNoTramita_modalidade_check" CHECK ("modalidadeSagres" ~ '^[0-9]{1,2}$');
