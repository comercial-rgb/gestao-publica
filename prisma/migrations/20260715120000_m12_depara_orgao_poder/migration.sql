-- M12 — DE-PARA Órgão → Poder (RREO Anexo 7). Aditiva: só cria a tabela DeParaOrgaoPoder.
-- Nenhuma coluna existente tocada. Fail-closed: órgão sem poder mapeado PARA o gerador do Anexo 7.

-- CreateTable
CREATE TABLE "DeParaOrgaoPoder" (
    "id" TEXT NOT NULL,
    "orgaoCodigo" VARCHAR(2) NOT NULL,
    "poder" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaOrgaoPoder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaOrgaoPoder_poder_idx" ON "DeParaOrgaoPoder"("poder");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaOrgaoPoder_orgaoCodigo_key" ON "DeParaOrgaoPoder"("orgaoCodigo");
