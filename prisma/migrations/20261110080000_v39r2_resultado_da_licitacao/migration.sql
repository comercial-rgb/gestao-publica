-- V39-R2 (R2-014 a 020, M11) — DO PROCESSO AO CONTRATO: itens do processo, participantes (a pessoa do cadastro unico),
-- propostas versionadas, o ato do resultado e as linhas por item (com a correcao que substitui), a adjudicacao, a
-- homologacao por ato com abrangencia e correcao, o item do contrato vindo do resultado e a ata de registro de precos.
-- Aditiva: so tabelas novas. Os CHECKs sao os de prisma/sql/ck_resultado_da_licitacao.sql (idempotente).
-- CreateTable
CREATE TABLE "ItemDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "lote" INTEGER,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipanteDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParticipanteDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaDoParticipante" (
    "id" TEXT NOT NULL,
    "participanteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "abrangencia" VARCHAR(5) NOT NULL,
    "valorUnitario" DECIMAL(18,4) NOT NULL,
    "documento" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PropostaDoParticipante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criterio" VARCHAR(30) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ResultadoDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoResultado" (
    "id" TEXT NOT NULL,
    "resultadoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "situacao" VARCHAR(12) NOT NULL,
    "participanteId" TEXT,
    "propostaId" TEXT,
    "valorUnitario" DECIMAL(18,4),
    "justificativa" TEXT,
    "substituiId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDoResultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjudicacaoDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "autoridade" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AdjudicacaoDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAdjudicado" (
    "id" TEXT NOT NULL,
    "adjudicacaoId" TEXT NOT NULL,
    "itemDoResultadoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemAdjudicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtoDeHomologacao" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "autoridade" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "corrigeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtoDeHomologacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemHomologado" (
    "id" TEXT NOT NULL,
    "atoId" TEXT NOT NULL,
    "itemAdjudicadoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemHomologado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemContratadoDoResultado" (
    "id" TEXT NOT NULL,
    "itemDoContratoId" TEXT NOT NULL,
    "itemDoResultadoId" TEXT NOT NULL,
    "itemDaAtaId" TEXT,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemContratadoDoResultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtaDeRegistroDePrecos" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "documento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtaDeRegistroDePrecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaAta" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "itemDoResultadoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDaAta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoProcesso_processoId_numero_key" ON "ItemDoProcesso"("processoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipanteDoProcesso_processoId_pessoaId_key" ON "ParticipanteDoProcesso"("processoId", "pessoaId");

-- CreateIndex
CREATE INDEX "PropostaDoParticipante_itemId_idx" ON "PropostaDoParticipante"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaDoParticipante_participanteId_itemId_versao_key" ON "PropostaDoParticipante"("participanteId", "itemId", "versao");

-- CreateIndex
CREATE INDEX "ResultadoDoProcesso_processoId_idx" ON "ResultadoDoProcesso"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoResultado_substituiId_key" ON "ItemDoResultado"("substituiId");

-- CreateIndex
CREATE INDEX "ItemDoResultado_itemId_idx" ON "ItemDoResultado"("itemId");

-- CreateIndex
CREATE INDEX "AdjudicacaoDoProcesso_processoId_idx" ON "AdjudicacaoDoProcesso"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAdjudicado_itemDoResultadoId_key" ON "ItemAdjudicado"("itemDoResultadoId");

-- CreateIndex
CREATE UNIQUE INDEX "AtoDeHomologacao_corrigeId_key" ON "AtoDeHomologacao"("corrigeId");

-- CreateIndex
CREATE INDEX "AtoDeHomologacao_processoId_idx" ON "AtoDeHomologacao"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemHomologado_atoId_itemAdjudicadoId_key" ON "ItemHomologado"("atoId", "itemAdjudicadoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemContratadoDoResultado_itemDoContratoId_key" ON "ItemContratadoDoResultado"("itemDoContratoId");

-- CreateIndex
CREATE INDEX "ItemContratadoDoResultado_itemDoResultadoId_idx" ON "ItemContratadoDoResultado"("itemDoResultadoId");

-- CreateIndex
CREATE INDEX "ItemContratadoDoResultado_itemDaAtaId_idx" ON "ItemContratadoDoResultado"("itemDaAtaId");

-- CreateIndex
CREATE UNIQUE INDEX "AtaDeRegistroDePrecos_processoId_numero_key" ON "AtaDeRegistroDePrecos"("processoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaAta_ataId_itemDoResultadoId_key" ON "ItemDaAta"("ataId", "itemDoResultadoId");

-- AddForeignKey
ALTER TABLE "ItemDoProcesso" ADD CONSTRAINT "ItemDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteDoProcesso" ADD CONSTRAINT "ParticipanteDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteDoProcesso" ADD CONSTRAINT "ParticipanteDoProcesso_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaDoParticipante" ADD CONSTRAINT "PropostaDoParticipante_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "ParticipanteDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaDoParticipante" ADD CONSTRAINT "PropostaDoParticipante_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoDoProcesso" ADD CONSTRAINT "ResultadoDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ItemDoResultado_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ResultadoDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ItemDoResultado_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ItemDoResultado_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "ParticipanteDoProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ItemDoResultado_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaDoParticipante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ItemDoResultado_substituiId_fkey" FOREIGN KEY ("substituiId") REFERENCES "ItemDoResultado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicacaoDoProcesso" ADD CONSTRAINT "AdjudicacaoDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAdjudicado" ADD CONSTRAINT "ItemAdjudicado_adjudicacaoId_fkey" FOREIGN KEY ("adjudicacaoId") REFERENCES "AdjudicacaoDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAdjudicado" ADD CONSTRAINT "ItemAdjudicado_itemDoResultadoId_fkey" FOREIGN KEY ("itemDoResultadoId") REFERENCES "ItemDoResultado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtoDeHomologacao" ADD CONSTRAINT "AtoDeHomologacao_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtoDeHomologacao" ADD CONSTRAINT "AtoDeHomologacao_corrigeId_fkey" FOREIGN KEY ("corrigeId") REFERENCES "AtoDeHomologacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemHomologado" ADD CONSTRAINT "ItemHomologado_atoId_fkey" FOREIGN KEY ("atoId") REFERENCES "AtoDeHomologacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemHomologado" ADD CONSTRAINT "ItemHomologado_itemAdjudicadoId_fkey" FOREIGN KEY ("itemAdjudicadoId") REFERENCES "ItemAdjudicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemContratadoDoResultado" ADD CONSTRAINT "ItemContratadoDoResultado_itemDoContratoId_fkey" FOREIGN KEY ("itemDoContratoId") REFERENCES "ItemDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemContratadoDoResultado" ADD CONSTRAINT "ItemContratadoDoResultado_itemDoResultadoId_fkey" FOREIGN KEY ("itemDoResultadoId") REFERENCES "ItemDoResultado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemContratadoDoResultado" ADD CONSTRAINT "ItemContratadoDoResultado_itemDaAtaId_fkey" FOREIGN KEY ("itemDaAtaId") REFERENCES "ItemDaAta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtaDeRegistroDePrecos" ADD CONSTRAINT "AtaDeRegistroDePrecos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaAta" ADD CONSTRAINT "ItemDaAta_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "AtaDeRegistroDePrecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaAta" ADD CONSTRAINT "ItemDaAta_itemDoResultadoId_fkey" FOREIGN KEY ("itemDoResultadoId") REFERENCES "ItemDoResultado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PropostaDoParticipante" ADD CONSTRAINT "ck_proposta_do_participante" CHECK (
  "versao" >= 1 AND "valorUnitario" > 0 AND "abrangencia" IN ('ITEM', 'LOTE') AND ("versao" = 1 OR "motivo" IS NOT NULL)
);
ALTER TABLE "ResultadoDoProcesso" ADD CONSTRAINT "ck_resultado_criterio" CHECK (
  "criterio" IN ('MENOR_PRECO', 'MAIOR_DESCONTO', 'MELHOR_TECNICA', 'TECNICA_E_PRECO', 'MAIOR_LANCE', 'MAIOR_RETORNO_ECONOMICO')
);
ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ck_item_do_resultado" CHECK (
  ("situacao" = 'VENCEDOR' AND "participanteId" IS NOT NULL AND "propostaId" IS NOT NULL AND "valorUnitario" > 0)
  OR ("situacao" IN ('FRACASSADO', 'DESERTO') AND "participanteId" IS NULL AND "propostaId" IS NULL AND "valorUnitario" IS NULL)
);
ALTER TABLE "AtoDeHomologacao" ADD CONSTRAINT "ck_ato_de_homologacao" CHECK (("corrigeId" IS NULL) OR ("motivo" IS NOT NULL));
ALTER TABLE "ItemDoProcesso" ADD CONSTRAINT "ck_item_do_processo" CHECK ("quantidade" > 0);
ALTER TABLE "ItemContratadoDoResultado" ADD CONSTRAINT "ck_item_contratado_do_resultado" CHECK ("quantidade" > 0);
ALTER TABLE "ItemDaAta" ADD CONSTRAINT "ck_item_da_ata" CHECK ("quantidade" > 0);
ALTER TABLE "AtaDeRegistroDePrecos" ADD CONSTRAINT "ck_ata_vigencia" CHECK ("vigenciaFim" > "vigenciaInicio");
