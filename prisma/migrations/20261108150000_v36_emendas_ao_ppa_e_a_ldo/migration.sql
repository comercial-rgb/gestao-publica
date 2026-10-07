-- CreateTable
CREATE TABLE "EmendaAoPlanejamento" (
    "id" TEXT NOT NULL,
    "planoId" TEXT,
    "ldoId" TEXT,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "objetivo" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "vereador" TEXT NOT NULL,
    "textoJuridico" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EmendaAoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaEmendaAoPlanejamento" (
    "id" TEXT NOT NULL,
    "emendaId" TEXT NOT NULL,
    "previsaoReceitaPpaId" TEXT,
    "programaPpaId" TEXT,
    "acaoPpaId" TEXT,
    "metaAnualLdoId" TEXT,
    "grandeza" VARCHAR(40) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemDaEmendaAoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SancaoDaEmendaAoPlanejamento" (
    "id" TEXT NOT NULL,
    "emendaId" TEXT NOT NULL,
    "resultado" "ResultadoDaSancao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "atoId" TEXT,
    "leiNumero" TEXT NOT NULL,
    "leiAno" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SancaoDaEmendaAoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemSancionadoDoPlanejamento" (
    "id" TEXT NOT NULL,
    "sancaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "alteracaoId" TEXT NOT NULL,

    CONSTRAINT "ItemSancionadoDoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioDeEmendaAoPlanejamento" (
    "id" TEXT NOT NULL,
    "previsaoReceitaPpaId" TEXT,
    "programaPpaId" TEXT,
    "acaoPpaId" TEXT,
    "metaAnualLdoId" TEXT,
    "grandeza" VARCHAR(40) NOT NULL,
    "motivo" TEXT NOT NULL,
    "revogaDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BloqueioDeEmendaAoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmendaAoPlanejamento_planoId_numero_key" ON "EmendaAoPlanejamento"("planoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "EmendaAoPlanejamento_ldoId_numero_key" ON "EmendaAoPlanejamento"("ldoId", "numero");

-- CreateIndex
CREATE INDEX "ItemDaEmendaAoPlanejamento_emendaId_idx" ON "ItemDaEmendaAoPlanejamento"("emendaId");

-- CreateIndex
CREATE UNIQUE INDEX "SancaoDaEmendaAoPlanejamento_emendaId_key" ON "SancaoDaEmendaAoPlanejamento"("emendaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSancionadoDoPlanejamento_itemId_key" ON "ItemSancionadoDoPlanejamento"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSancionadoDoPlanejamento_alteracaoId_key" ON "ItemSancionadoDoPlanejamento"("alteracaoId");

-- CreateIndex
CREATE INDEX "ItemSancionadoDoPlanejamento_sancaoId_idx" ON "ItemSancionadoDoPlanejamento"("sancaoId");

-- CreateIndex
CREATE UNIQUE INDEX "BloqueioDeEmendaAoPlanejamento_revogaDeId_key" ON "BloqueioDeEmendaAoPlanejamento"("revogaDeId");

-- CreateIndex
CREATE INDEX "BloqueioDeEmendaAoPlanejamento_previsaoReceitaPpaId_idx" ON "BloqueioDeEmendaAoPlanejamento"("previsaoReceitaPpaId");

-- CreateIndex
CREATE INDEX "BloqueioDeEmendaAoPlanejamento_programaPpaId_idx" ON "BloqueioDeEmendaAoPlanejamento"("programaPpaId");

-- CreateIndex
CREATE INDEX "BloqueioDeEmendaAoPlanejamento_acaoPpaId_idx" ON "BloqueioDeEmendaAoPlanejamento"("acaoPpaId");

-- CreateIndex
CREATE INDEX "BloqueioDeEmendaAoPlanejamento_metaAnualLdoId_idx" ON "BloqueioDeEmendaAoPlanejamento"("metaAnualLdoId");

-- AddForeignKey
ALTER TABLE "EmendaAoPlanejamento" ADD CONSTRAINT "EmendaAoPlanejamento_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmendaAoPlanejamento" ADD CONSTRAINT "EmendaAoPlanejamento_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ItemDaEmendaAoPlanejamento_emendaId_fkey" FOREIGN KEY ("emendaId") REFERENCES "EmendaAoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ItemDaEmendaAoPlanejamento_previsaoReceitaPpaId_fkey" FOREIGN KEY ("previsaoReceitaPpaId") REFERENCES "PrevisaoReceitaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ItemDaEmendaAoPlanejamento_programaPpaId_fkey" FOREIGN KEY ("programaPpaId") REFERENCES "ProgramaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ItemDaEmendaAoPlanejamento_acaoPpaId_fkey" FOREIGN KEY ("acaoPpaId") REFERENCES "AcaoPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ItemDaEmendaAoPlanejamento_metaAnualLdoId_fkey" FOREIGN KEY ("metaAnualLdoId") REFERENCES "MetaAnualLdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SancaoDaEmendaAoPlanejamento" ADD CONSTRAINT "SancaoDaEmendaAoPlanejamento_emendaId_fkey" FOREIGN KEY ("emendaId") REFERENCES "EmendaAoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SancaoDaEmendaAoPlanejamento" ADD CONSTRAINT "SancaoDaEmendaAoPlanejamento_atoId_fkey" FOREIGN KEY ("atoId") REFERENCES "AtoDeAlteracaoDoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionadoDoPlanejamento" ADD CONSTRAINT "ItemSancionadoDoPlanejamento_sancaoId_fkey" FOREIGN KEY ("sancaoId") REFERENCES "SancaoDaEmendaAoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionadoDoPlanejamento" ADD CONSTRAINT "ItemSancionadoDoPlanejamento_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDaEmendaAoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSancionadoDoPlanejamento" ADD CONSTRAINT "ItemSancionadoDoPlanejamento_alteracaoId_fkey" FOREIGN KEY ("alteracaoId") REFERENCES "AlteracaoDeValorPlanejado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "BloqueioDeEmendaAoPlanejamento_previsaoReceitaPpaId_fkey" FOREIGN KEY ("previsaoReceitaPpaId") REFERENCES "PrevisaoReceitaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "BloqueioDeEmendaAoPlanejamento_programaPpaId_fkey" FOREIGN KEY ("programaPpaId") REFERENCES "ProgramaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "BloqueioDeEmendaAoPlanejamento_acaoPpaId_fkey" FOREIGN KEY ("acaoPpaId") REFERENCES "AcaoPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "BloqueioDeEmendaAoPlanejamento_metaAnualLdoId_fkey" FOREIGN KEY ("metaAnualLdoId") REFERENCES "MetaAnualLdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "BloqueioDeEmendaAoPlanejamento_revogaDeId_fkey" FOREIGN KEY ("revogaDeId") REFERENCES "BloqueioDeEmendaAoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- V36 — emendas ao PPA e à LDO: a emenda é de UMA peça; o item e o bloqueio apontam UM alvo, com grandeza que é coluna
-- dele (o mesmo rol do ck_alteracao_valor_alvo_e_grandeza); o item nunca é zero; a sanção sem ato é só a rejeitada.
ALTER TABLE "EmendaAoPlanejamento" ADD CONSTRAINT "ck_emenda_planejamento_uma_peca"
  CHECK (num_nonnulls("planoId", "ldoId") = 1);
ALTER TABLE "EmendaAoPlanejamento" ADD CONSTRAINT "ck_emenda_planejamento_numero_positivo"
  CHECK ("numero" > 0);
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ck_item_emenda_planejamento_nao_zero"
  CHECK ("valor" <> 0);
ALTER TABLE "ItemDaEmendaAoPlanejamento" ADD CONSTRAINT "ck_item_emenda_planejamento_alvo_e_grandeza"
  CHECK (
    (num_nonnulls("previsaoReceitaPpaId", "programaPpaId", "acaoPpaId", "metaAnualLdoId") = 1)
    AND (
      ("previsaoReceitaPpaId" IS NOT NULL AND "grandeza" = 'valor')
      OR ("programaPpaId" IS NOT NULL AND "grandeza" = 'valorPrevisto')
      OR ("acaoPpaId" IS NOT NULL AND "grandeza" = 'metaFinanceira')
      OR ("metaAnualLdoId" IS NOT NULL AND "grandeza" IN (
        'receitaTotal', 'receitaPrimaria', 'despesaTotal', 'despesaPrimaria',
        'resultadoNominal', 'dividaPublicaConsolidada', 'dividaConsolidadaLiquida',
        'receitaPrimariaPpp', 'despesaPrimariaPpp', 'impactoSaldoPpp'
      ))
    )
  );
ALTER TABLE "BloqueioDeEmendaAoPlanejamento" ADD CONSTRAINT "ck_bloqueio_emenda_planejamento_alvo_e_grandeza"
  CHECK (
    (num_nonnulls("previsaoReceitaPpaId", "programaPpaId", "acaoPpaId", "metaAnualLdoId") = 1)
    AND (
      ("previsaoReceitaPpaId" IS NOT NULL AND "grandeza" = 'valor')
      OR ("programaPpaId" IS NOT NULL AND "grandeza" = 'valorPrevisto')
      OR ("acaoPpaId" IS NOT NULL AND "grandeza" = 'metaFinanceira')
      OR ("metaAnualLdoId" IS NOT NULL AND "grandeza" IN (
        'receitaTotal', 'receitaPrimaria', 'despesaTotal', 'despesaPrimaria',
        'resultadoNominal', 'dividaPublicaConsolidada', 'dividaConsolidadaLiquida',
        'receitaPrimariaPpp', 'despesaPrimariaPpp', 'impactoSaldoPpp'
      ))
    )
  );
ALTER TABLE "SancaoDaEmendaAoPlanejamento" ADD CONSTRAINT "ck_sancao_emenda_planejamento_ato"
  CHECK (("resultado" = 'REJEITADA') = ("atoId" IS NULL));
