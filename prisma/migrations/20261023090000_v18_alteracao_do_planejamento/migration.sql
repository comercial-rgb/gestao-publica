-- V18/C13 — O ATO QUE ALTERA A PECA DE PLANEJAMENTO, E O VALOR QUE ELE MUDOU.
--
-- TR 5.9.1.14/.18/.30 (PPA) e 5.9.2.3/.10/.18 (LDO). O criterio da ordem V14 e C13:
-- "versionar alteracoes de PPA/LDO e emitir comparativo — original, atos e valores
-- alterados preservados".
--
-- ⚠️ NAO HA COPIA DA PECA POR VERSAO. A candidata `versaoId` nas 20 tabelas exigiria
-- derrubar `PlanoPlurianual.@@unique([anoInicio])` e `LeiDiretrizesOrcamentarias.exercicio
-- @unique` — as duas unicidades que impedem duas verdades sobre o mesmo periodo — e
-- multiplicaria as 29 colunas de dinheiro do modulo em N copias. Recusada em
-- `docs/varreduras/varredura-v18-versao-do-planejamento.md`.
--
-- O mecanismo e o que o repositorio ja usa para a LOA (reprevisao da receita, credito
-- adicional do M03): o ato e uma linha, o valor que ele mexeu e um item COM SINAL, nada se
-- edita, e o valor vigente e `original + soma dos ajustes`.
--
-- As tabelas sao NOVAS e nada e removido: migration ADITIVA, zero DROP.

-- CreateTable
CREATE TABLE "AtoDeAlteracaoDoPlanejamento" (
    "id" TEXT NOT NULL,
    "planoId" TEXT,
    "ldoId" TEXT,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtoDeAlteracaoDoPlanejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlteracaoDeValorPlanejado" (
    "id" TEXT NOT NULL,
    "atoId" TEXT NOT NULL,
    "previsaoReceitaPpaId" TEXT,
    "programaPpaId" TEXT,
    "acaoPpaId" TEXT,
    "metaAnualLdoId" TEXT,
    "grandeza" VARCHAR(40) NOT NULL,
    "valorAjuste" DECIMAL(18,2) NOT NULL,
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AlteracaoDeValorPlanejado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtoDeAlteracaoDoPlanejamento_planoId_data_idx" ON "AtoDeAlteracaoDoPlanejamento"("planoId", "data");

-- CreateIndex
CREATE INDEX "AtoDeAlteracaoDoPlanejamento_ldoId_data_idx" ON "AtoDeAlteracaoDoPlanejamento"("ldoId", "data");

-- ⚠️ DUAS UNICIDADES, UMA POR PECA. No Postgres NULL nao conflita com NULL, entao cada
-- indice restringe apenas as linhas da sua peca — o que e exatamente o desejado: dois atos
-- "lei 10/2026" no MESMO PPA sao um duplicado; a lei 10/2026 que altera a LDO e outro ato.
-- CreateIndex
CREATE UNIQUE INDEX "AtoDeAlteracaoDoPlanejamento_planoId_ano_numero_key" ON "AtoDeAlteracaoDoPlanejamento"("planoId", "ano", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "AtoDeAlteracaoDoPlanejamento_ldoId_ano_numero_key" ON "AtoDeAlteracaoDoPlanejamento"("ldoId", "ano", "numero");

-- CreateIndex
CREATE INDEX "AlteracaoDeValorPlanejado_atoId_idx" ON "AlteracaoDeValorPlanejado"("atoId");

-- CreateIndex
CREATE INDEX "AlteracaoDeValorPlanejado_previsaoReceitaPpaId_idx" ON "AlteracaoDeValorPlanejado"("previsaoReceitaPpaId");

-- CreateIndex
CREATE INDEX "AlteracaoDeValorPlanejado_programaPpaId_idx" ON "AlteracaoDeValorPlanejado"("programaPpaId");

-- CreateIndex
CREATE INDEX "AlteracaoDeValorPlanejado_acaoPpaId_idx" ON "AlteracaoDeValorPlanejado"("acaoPpaId");

-- CreateIndex
CREATE INDEX "AlteracaoDeValorPlanejado_metaAnualLdoId_idx" ON "AlteracaoDeValorPlanejado"("metaAnualLdoId");

-- AddForeignKey
ALTER TABLE "AtoDeAlteracaoDoPlanejamento" ADD CONSTRAINT "AtoDeAlteracaoDoPlanejamento_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtoDeAlteracaoDoPlanejamento" ADD CONSTRAINT "AtoDeAlteracaoDoPlanejamento_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeValorPlanejado" ADD CONSTRAINT "AlteracaoDeValorPlanejado_atoId_fkey" FOREIGN KEY ("atoId") REFERENCES "AtoDeAlteracaoDoPlanejamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ RESTRICT, E NAO O `SET NULL` QUE O PRISMA ESCOLHE PARA RELACAO OPCIONAL. Com SET NULL,
-- apagar a linha planejada zeraria os quatro alvos do item e o DELETE falharia com violacao
-- do CHECK abaixo — mensagem que nao diz o que houve. RESTRICT diz: nao se apaga um valor
-- que uma lei ja alterou.
-- AddForeignKey
ALTER TABLE "AlteracaoDeValorPlanejado" ADD CONSTRAINT "AlteracaoDeValorPlanejado_previsaoReceitaPpaId_fkey" FOREIGN KEY ("previsaoReceitaPpaId") REFERENCES "PrevisaoReceitaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeValorPlanejado" ADD CONSTRAINT "AlteracaoDeValorPlanejado_programaPpaId_fkey" FOREIGN KEY ("programaPpaId") REFERENCES "ProgramaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeValorPlanejado" ADD CONSTRAINT "AlteracaoDeValorPlanejado_acaoPpaId_fkey" FOREIGN KEY ("acaoPpaId") REFERENCES "AcaoPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoDeValorPlanejado" ADD CONSTRAINT "AlteracaoDeValorPlanejado_metaAnualLdoId_fkey" FOREIGN KEY ("metaAnualLdoId") REFERENCES "MetaAnualLdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- OS CHECKS — as regras que o banco sustenta contra o INSERT direto.
--
-- ⚠️ Eles moram AQUI, na migration, e nao em `prisma/sql/`: o Prisma nao modela CHECK, e se
-- ele vivesse fora, um `migrate reset` recriaria o banco SEM a constraint e ninguem
-- perceberia ate um valor invalido entrar. Mesma decisao da migration de origem do M02b
-- (`20260913100100_v4_plurianual_ppa_ldo`, linha 480).
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ UMA PECA POR ATO, NUNCA AS DUAS E NUNCA NENHUMA.
-- Um ato que alterasse o PPA e a LDO ao mesmo tempo produziria um comparativo em que o total
-- de nenhuma das duas fecha; um ato sem peca seria uma lei que altera nada. `num_nonnulls`
-- diz isso numa expressao — a alternativa (`(A IS NOT NULL AND B IS NULL) OR (...)`) diz o
-- mesmo em duas linhas e erra mais facil quando um terceiro alvo aparecer.
ALTER TABLE "AtoDeAlteracaoDoPlanejamento"
  ADD CONSTRAINT "ck_ato_alteracao_uma_peca"
  CHECK (num_nonnulls("planoId", "ldoId") = 1);

-- ⚠️ A PUBLICACAO NAO ANTECEDE O ATO. Fim antes do comeco e erro de digitacao que nenhum
-- relatorio detecta sozinho — ele so produz um ato "publicado antes de assinado", e a
-- consulta cronologica passa a contar uma historia impossivel. Mesmo raciocinio do
-- `ck_ldo_tramite_em_ordem`.
ALTER TABLE "AtoDeAlteracaoDoPlanejamento"
  ADD CONSTRAINT "ck_ato_alteracao_publicacao_nao_antecede"
  CHECK ("dataPublicacao" >= "data");

-- ⚠️ AJUSTE ZERO NAO E ALTERACAO. Ele apareceria no comparativo, somaria nada, e faria quem
-- le procurar a diferenca que nao existe. O sinal e o conteudo do item: + acresce, − reduz.
ALTER TABLE "AlteracaoDeValorPlanejado"
  ADD CONSTRAINT "ck_alteracao_valor_ajuste_nao_zero"
  CHECK ("valorAjuste" <> 0);

-- ⚠️ UM CHECK QUE AMARRA ALVO E GRANDEZA JUNTOS, e nao dois separados.
--
-- Ele exige, na mesma expressao, exatamente UM alvo preenchido E que a `grandeza` seja uma
-- coluna DAQUELE alvo. Partido em dois ("exatamente um alvo" + "grandeza no rol"), o par
-- impossivel "acao do PPA com grandeza receitaPrimaria" passaria pelos dois e nao existiria
-- em tabela nenhuma — o comparativo somaria um ajuste sobre uma coluna que o alvo nao tem.
--
-- ⚠️ E O ROL E DAS COLUNAS DESTE SCHEMA, nao de norma externa: `valor`, `valorPrevisto`,
-- `metaFinanceira` e as dez colunas de dinheiro da `MetaAnualLdo`. Um teste confere o rol do
-- dominio contra o DMMF do Prisma — o rol nao se acredita, se mede contra o schema.
--
-- ⚠️ A META FISICA NAO ESTA AQUI: `AcaoPpa.metaFisica` e `PrioridadeLdo.meta` sao
-- `Decimal(18,6)`, e `valorAjuste` e dinheiro `Decimal(18,2)`. Misturar as precisoes perderia
-- a casa que a meta persegue ("3,5 km", "0,25 do sistema"). Pendencia ALTERACAO-DE-META-FISICA.
ALTER TABLE "AlteracaoDeValorPlanejado"
  ADD CONSTRAINT "ck_alteracao_valor_alvo_e_grandeza"
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
