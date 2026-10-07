-- V36 — M02b: audiências públicas do planejamento (TR 5.9.1.1-2) e obras previstas na LDO (TR 5.9.2.16-17). Aditiva.

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "audienciaPublicaId" TEXT;

-- CreateTable
CREATE TABLE "AudienciaPublica" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "peca" VARCHAR(3) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "local" TEXT NOT NULL,
    "pauta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AudienciaPublica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoDaAudiencia" (
    "id" TEXT NOT NULL,
    "audienciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "solicitanteNome" TEXT NOT NULL,
    "solicitanteContato" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SolicitacaoDaAudiencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SituacaoDaSolicitacao" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "situacao" VARCHAR(20) NOT NULL,
    "parecer" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SituacaoDaSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObraPrevistaLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "obraId" TEXT,
    "descricao" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "valorPrevisto" DECIMAL(18,2) NOT NULL,
    "valorConservacao" DECIMAL(18,2) NOT NULL,
    "valorNovosProjetos" DECIMAL(18,2) NOT NULL,
    "valorNoExercicio" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ObraPrevistaLdo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudienciaPublica_exercicio_idx" ON "AudienciaPublica"("exercicio");

-- CreateIndex
CREATE INDEX "SolicitacaoDaAudiencia_audienciaId_idx" ON "SolicitacaoDaAudiencia"("audienciaId");

-- CreateIndex
CREATE INDEX "SolicitacaoDaAudiencia_orgaoId_idx" ON "SolicitacaoDaAudiencia"("orgaoId");

-- CreateIndex
CREATE INDEX "SituacaoDaSolicitacao_solicitacaoId_criadoEm_idx" ON "SituacaoDaSolicitacao"("solicitacaoId", "criadoEm");

-- CreateIndex
CREATE INDEX "ObraPrevistaLdo_ldoId_idx" ON "ObraPrevistaLdo"("ldoId");

-- CreateIndex
CREATE INDEX "ObraPrevistaLdo_orgaoId_idx" ON "ObraPrevistaLdo"("orgaoId");

-- CreateIndex
CREATE INDEX "ObraPrevistaLdo_obraId_idx" ON "ObraPrevistaLdo"("obraId");

-- CreateIndex
CREATE INDEX "Anexo_audienciaPublicaId_idx" ON "Anexo"("audienciaPublicaId");

-- AddForeignKey
ALTER TABLE "SolicitacaoDaAudiencia" ADD CONSTRAINT "SolicitacaoDaAudiencia_audienciaId_fkey" FOREIGN KEY ("audienciaId") REFERENCES "AudienciaPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDaAudiencia" ADD CONSTRAINT "SolicitacaoDaAudiencia_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituacaoDaSolicitacao" ADD CONSTRAINT "SituacaoDaSolicitacao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDaAudiencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObraPrevistaLdo" ADD CONSTRAINT "ObraPrevistaLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObraPrevistaLdo" ADD CONSTRAINT "ObraPrevistaLdo_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObraPrevistaLdo" ADD CONSTRAINT "ObraPrevistaLdo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_audienciaPublicaId_fkey" FOREIGN KEY ("audienciaPublicaId") REFERENCES "AudienciaPublica"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Os domínios fechados, como os CHECKs do M02b: a peça discutida e a situação da solicitação.
ALTER TABLE "AudienciaPublica" ADD CONSTRAINT "AudienciaPublica_peca_check" CHECK ("peca" IN ('PPA', 'LDO', 'LOA'));
ALTER TABLE "SituacaoDaSolicitacao" ADD CONSTRAINT "SituacaoDaSolicitacao_situacao_check" CHECK ("situacao" IN ('EM_ANALISE', 'ACOLHIDA', 'NAO_ACOLHIDA'));
-- Os valores da obra prevista não são negativos, e o do exercício não excede o previsto.
ALTER TABLE "ObraPrevistaLdo" ADD CONSTRAINT "ObraPrevistaLdo_valores_check" CHECK ("valorPrevisto" >= 0 AND "valorConservacao" >= 0 AND "valorNovosProjetos" >= 0 AND "valorNoExercicio" >= 0 AND "valorNoExercicio" <= "valorPrevisto");
