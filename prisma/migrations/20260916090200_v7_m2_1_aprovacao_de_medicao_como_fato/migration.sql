-- V7 M2.1 — a aprovação da medição de obra vira FATO (INSERT). O UPDATE em "MedicaoDeObra" não está no
-- censo do papel de runtime: sob gestao_app, aprovar medição falhava. Aditiva; as colunas antigas ficam.
CREATE TABLE "AprovacaoDeMedicao" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AprovacaoDeMedicao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AprovacaoDeMedicao_medicaoId_key" ON "AprovacaoDeMedicao"("medicaoId");

ALTER TABLE "AprovacaoDeMedicao" ADD CONSTRAINT "AprovacaoDeMedicao_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDeObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
