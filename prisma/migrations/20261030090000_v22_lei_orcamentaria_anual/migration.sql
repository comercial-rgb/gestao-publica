-- V22 — a LEI ORÇAMENTÁRIA ANUAL (M02b): o projeto de lei, a lei que o aprovou e os anexos.
--
-- ⚠️ A APROVAÇÃO É TABELA À PARTE, única por LOA e append-only: o runtime não recebe UPDATE em
-- nenhuma das duas. O anexo ganha a coluna de dono, como todo dono do M22 (FK de verdade).

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "leiOrcamentariaAnualId" TEXT;

-- CreateTable
CREATE TABLE "LeiOrcamentariaAnual" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "numeroDoProjeto" TEXT NOT NULL,
    "dataDoEnvio" TIMESTAMP(3) NOT NULL,
    "ementa" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LeiOrcamentariaAnual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoDaLeiOrcamentaria" (
    "id" TEXT NOT NULL,
    "leiId" TEXT NOT NULL,
    "numeroDaLei" TEXT NOT NULL,
    "dataDaSancao" TIMESTAMP(3) NOT NULL,
    "dataDaPublicacao" TIMESTAMP(3) NOT NULL,
    "veiculoDePublicacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AprovacaoDaLeiOrcamentaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeiOrcamentariaAnual_exercicio_key" ON "LeiOrcamentariaAnual"("exercicio");

-- CreateIndex
CREATE UNIQUE INDEX "AprovacaoDaLeiOrcamentaria_leiId_key" ON "AprovacaoDaLeiOrcamentaria"("leiId");

-- CreateIndex
CREATE INDEX "Anexo_leiOrcamentariaAnualId_idx" ON "Anexo"("leiOrcamentariaAnualId");

-- AddForeignKey
ALTER TABLE "AprovacaoDaLeiOrcamentaria" ADD CONSTRAINT "AprovacaoDaLeiOrcamentaria_leiId_fkey" FOREIGN KEY ("leiId") REFERENCES "LeiOrcamentariaAnual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_leiOrcamentariaAnualId_fkey" FOREIGN KEY ("leiOrcamentariaAnualId") REFERENCES "LeiOrcamentariaAnual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A publicação não vem antes da sanção. O caso de uso confere também sanção × envio do projeto
-- (que está na outra tabela); este CHECK é o que o banco consegue afirmar sozinho.
ALTER TABLE "AprovacaoDaLeiOrcamentaria" ADD CONSTRAINT "AprovacaoDaLeiOrcamentaria_publicacao_chk" CHECK ("dataDaPublicacao" >= "dataDaSancao");
