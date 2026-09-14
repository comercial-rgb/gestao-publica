-- V7 M1 U2 — o encerramento de finalidade de dependente vira FATO (INSERT). O papel de runtime não tem
-- UPDATE em "FinalidadeDependente"; as colunas dataBaixa/motivoBaixa ficam como legado (zero DROP).
CREATE TABLE "EncerramentoDeFinalidadeDependente" (
    "id" TEXT NOT NULL,
    "finalidadeId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EncerramentoDeFinalidadeDependente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EncerramentoDeFinalidadeDependente_finalidadeId_key" ON "EncerramentoDeFinalidadeDependente"("finalidadeId");

ALTER TABLE "EncerramentoDeFinalidadeDependente" ADD CONSTRAINT "EncerramentoDeFinalidadeDependente_finalidadeId_fkey" FOREIGN KEY ("finalidadeId") REFERENCES "FinalidadeDependente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EncerramentoDeFinalidadeDependente" ADD CONSTRAINT "ck_encerramento_de_finalidade_motivo" CHECK (length(btrim("motivo")) >= 5);

-- Uma linha LEGADA já baixada por UPDATE não recebe encerramento novo: a baixa dela já é fato.
