-- Sessão noturna V4 (§8, Fila A) — M02b: PPA e LDO, o planejamento PLURIANUAL. Vinte tabelas,
-- conciliadas do siafic-cg c04ad5a (`prisma/schema/m02b-plurianual.prisma`); o DDL foi gerado AQUI
-- por `prisma migrate diff` sobre o schema local; os CHECKs vieram da migration de origem, um a um.
-- Aditiva: zero DROP. Nenhuma tabela tem `unidadeOrcId` (o plano é ato do ente — canário t5).

-- CreateTable
CREATE TABLE "PlanoPlurianual" (
    "id" TEXT NOT NULL,
    "anoInicio" INTEGER NOT NULL,
    "anoFim" INTEGER NOT NULL,
    "leiRef" TEXT NOT NULL,
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PlanoPlurianual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EixoEstruturante" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EixoEstruturante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaTematica" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "eixoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AreaTematica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicoAlvo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PublicoAlvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Macroacao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Macroacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramaPpa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "areaTematicaId" TEXT NOT NULL,
    "publicoAlvoId" TEXT,
    "estrategia" TEXT,
    "valorPrevisto" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProgramaPpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicadorPrograma" (
    "id" TEXT NOT NULL,
    "programaPpaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "situacaoInicial" DECIMAL(18,6) NOT NULL,
    "situacaoModificada" DECIMAL(18,6) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "IndicadorPrograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcaoPpa" (
    "id" TEXT NOT NULL,
    "programaPpaId" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "macroacaoId" TEXT,
    "unidadeExecutoraId" TEXT,
    "funcaoId" TEXT,
    "subfuncaoId" TEXT,
    "produto" TEXT NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "regiaoAtendida" TEXT,
    "metaFisica" DECIMAL(18,6) NOT NULL,
    "metaFinanceira" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AcaoPpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrevisaoReceitaPpa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PrevisaoReceitaPpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaAnteriorPpa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ReceitaAnteriorPpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeiDiretrizesOrcamentarias" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "inicioVigencia" TIMESTAMP(3) NOT NULL,
    "fimVigencia" TIMESTAMP(3) NOT NULL,
    "dataEnvioLegislativo" TIMESTAMP(3),
    "dataDevolucaoExecutivo" TIMESTAMP(3),
    "numeroProtocolo" TEXT,
    "dataSancao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LeiDiretrizesOrcamentarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrioridadeLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "acaoId" TEXT,
    "descricaoAcao" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "meta" DECIMAL(18,6) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PrioridadeLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAnualLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "receitaTotal" DECIMAL(18,2) NOT NULL,
    "receitaPrimaria" DECIMAL(18,2) NOT NULL,
    "despesaTotal" DECIMAL(18,2) NOT NULL,
    "despesaPrimaria" DECIMAL(18,2) NOT NULL,
    "resultadoNominal" DECIMAL(18,2) NOT NULL,
    "dividaPublicaConsolidada" DECIMAL(18,2) NOT NULL,
    "dividaConsolidadaLiquida" DECIMAL(18,2) NOT NULL,
    "receitaPrimariaPpp" DECIMAL(18,2) NOT NULL,
    "despesaPrimariaPpp" DECIMAL(18,2) NOT NULL,
    "impactoSaldoPpp" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MetaAnualLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiscoFiscal" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "codigoPassivo" VARCHAR(2) NOT NULL,
    "descricaoPassivo" TEXT NOT NULL,
    "valorPassivo" DECIMAL(18,2) NOT NULL,
    "descricaoProvidencia" TEXT NOT NULL,
    "valorProvidencia" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RiscoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenunciaReceitaLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "descricaoCompensacao" TEXT NOT NULL,
    "valorCompensacao" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RenunciaReceitaLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlienacaoBemLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "descricaoBem" TEXT NOT NULL,
    "valorAlienacao" DECIMAL(18,2) NOT NULL,
    "numeroLaudo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AlienacaoBemLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacaoAlienacaoLdo" (
    "id" TEXT NOT NULL,
    "alienacaoId" TEXT NOT NULL,
    "tipoAplicacao" VARCHAR(2) NOT NULL,
    "anoAplicacao" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AplicacaoAlienacaoLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividaConsolidadaLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "dividaConsolidada" DECIMAL(18,2) NOT NULL,
    "deducoes" DECIMAL(18,2) NOT NULL,
    "receitaCorrenteLiquida" DECIMAL(18,2) NOT NULL,
    "percentualRcl" DECIMAL(9,6) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DividaConsolidadaLdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjecaoAtuarialRpps" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "receitasPrevidenciarias" DECIMAL(18,2) NOT NULL,
    "despesasPrevidenciarias" DECIMAL(18,2) NOT NULL,
    "resultadoPrevidenciario" DECIMAL(18,2) NOT NULL,
    "saldoFinanceiro" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProjecaoAtuarialRpps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MargemExpansaoLdo" (
    "id" TEXT NOT NULL,
    "ldoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "aumentoPermanenteReceita" DECIMAL(18,2) NOT NULL,
    "reducaoPermanenteDespesa" DECIMAL(18,2) NOT NULL,
    "novasDespesasObrigatorias" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MargemExpansaoLdo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanoPlurianual_anoInicio_anoFim_idx" ON "PlanoPlurianual"("anoInicio", "anoFim");

-- CreateIndex
CREATE UNIQUE INDEX "PlanoPlurianual_anoInicio_key" ON "PlanoPlurianual"("anoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "EixoEstruturante_codigo_key" ON "EixoEstruturante"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AreaTematica_codigo_key" ON "AreaTematica"("codigo");

-- CreateIndex
CREATE INDEX "AreaTematica_eixoId_idx" ON "AreaTematica"("eixoId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicoAlvo_codigo_key" ON "PublicoAlvo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Macroacao_codigo_key" ON "Macroacao"("codigo");

-- CreateIndex
CREATE INDEX "ProgramaPpa_areaTematicaId_idx" ON "ProgramaPpa"("areaTematicaId");

-- CreateIndex
CREATE INDEX "ProgramaPpa_publicoAlvoId_idx" ON "ProgramaPpa"("publicoAlvoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaPpa_planoId_programaId_key" ON "ProgramaPpa"("planoId", "programaId");

-- CreateIndex
CREATE INDEX "IndicadorPrograma_programaPpaId_idx" ON "IndicadorPrograma"("programaPpaId");

-- CreateIndex
CREATE INDEX "AcaoPpa_macroacaoId_idx" ON "AcaoPpa"("macroacaoId");

-- CreateIndex
CREATE INDEX "AcaoPpa_unidadeExecutoraId_idx" ON "AcaoPpa"("unidadeExecutoraId");

-- CreateIndex
CREATE INDEX "AcaoPpa_funcaoId_idx" ON "AcaoPpa"("funcaoId");

-- CreateIndex
CREATE INDEX "AcaoPpa_subfuncaoId_idx" ON "AcaoPpa"("subfuncaoId");

-- CreateIndex
CREATE UNIQUE INDEX "AcaoPpa_programaPpaId_acaoId_key" ON "AcaoPpa"("programaPpaId", "acaoId");

-- CreateIndex
CREATE INDEX "PrevisaoReceitaPpa_planoId_ano_idx" ON "PrevisaoReceitaPpa"("planoId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "PrevisaoReceitaPpa_planoId_naturezaReceitaId_fonteId_ano_key" ON "PrevisaoReceitaPpa"("planoId", "naturezaReceitaId", "fonteId", "ano");

-- CreateIndex
CREATE INDEX "ReceitaAnteriorPpa_planoId_ano_idx" ON "ReceitaAnteriorPpa"("planoId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaAnteriorPpa_planoId_naturezaReceitaId_ano_key" ON "ReceitaAnteriorPpa"("planoId", "naturezaReceitaId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "LeiDiretrizesOrcamentarias_exercicio_key" ON "LeiDiretrizesOrcamentarias"("exercicio");

-- CreateIndex
CREATE INDEX "PrioridadeLdo_ldoId_idx" ON "PrioridadeLdo"("ldoId");

-- CreateIndex
CREATE INDEX "PrioridadeLdo_acaoId_idx" ON "PrioridadeLdo"("acaoId");

-- CreateIndex
CREATE INDEX "MetaAnualLdo_ldoId_idx" ON "MetaAnualLdo"("ldoId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAnualLdo_ldoId_ano_key" ON "MetaAnualLdo"("ldoId", "ano");

-- CreateIndex
CREATE INDEX "RiscoFiscal_ldoId_idx" ON "RiscoFiscal"("ldoId");

-- CreateIndex
CREATE INDEX "RenunciaReceitaLdo_ldoId_idx" ON "RenunciaReceitaLdo"("ldoId");

-- CreateIndex
CREATE INDEX "AlienacaoBemLdo_ldoId_idx" ON "AlienacaoBemLdo"("ldoId");

-- CreateIndex
CREATE INDEX "AplicacaoAlienacaoLdo_alienacaoId_idx" ON "AplicacaoAlienacaoLdo"("alienacaoId");

-- CreateIndex
CREATE INDEX "DividaConsolidadaLdo_ldoId_idx" ON "DividaConsolidadaLdo"("ldoId");

-- CreateIndex
CREATE UNIQUE INDEX "DividaConsolidadaLdo_ldoId_ano_key" ON "DividaConsolidadaLdo"("ldoId", "ano");

-- CreateIndex
CREATE INDEX "ProjecaoAtuarialRpps_ldoId_idx" ON "ProjecaoAtuarialRpps"("ldoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjecaoAtuarialRpps_ldoId_ano_key" ON "ProjecaoAtuarialRpps"("ldoId", "ano");

-- CreateIndex
CREATE INDEX "MargemExpansaoLdo_ldoId_idx" ON "MargemExpansaoLdo"("ldoId");

-- CreateIndex
CREATE UNIQUE INDEX "MargemExpansaoLdo_ldoId_ano_key" ON "MargemExpansaoLdo"("ldoId", "ano");

-- AddForeignKey
ALTER TABLE "AreaTematica" ADD CONSTRAINT "AreaTematica_eixoId_fkey" FOREIGN KEY ("eixoId") REFERENCES "EixoEstruturante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramaPpa" ADD CONSTRAINT "ProgramaPpa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramaPpa" ADD CONSTRAINT "ProgramaPpa_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramaPpa" ADD CONSTRAINT "ProgramaPpa_areaTematicaId_fkey" FOREIGN KEY ("areaTematicaId") REFERENCES "AreaTematica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramaPpa" ADD CONSTRAINT "ProgramaPpa_publicoAlvoId_fkey" FOREIGN KEY ("publicoAlvoId") REFERENCES "PublicoAlvo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicadorPrograma" ADD CONSTRAINT "IndicadorPrograma_programaPpaId_fkey" FOREIGN KEY ("programaPpaId") REFERENCES "ProgramaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_programaPpaId_fkey" FOREIGN KEY ("programaPpaId") REFERENCES "ProgramaPpa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_macroacaoId_fkey" FOREIGN KEY ("macroacaoId") REFERENCES "Macroacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_unidadeExecutoraId_fkey" FOREIGN KEY ("unidadeExecutoraId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "Funcao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPpa" ADD CONSTRAINT "AcaoPpa_subfuncaoId_fkey" FOREIGN KEY ("subfuncaoId") REFERENCES "Subfuncao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrevisaoReceitaPpa" ADD CONSTRAINT "PrevisaoReceitaPpa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrevisaoReceitaPpa" ADD CONSTRAINT "PrevisaoReceitaPpa_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrevisaoReceitaPpa" ADD CONSTRAINT "PrevisaoReceitaPpa_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaAnteriorPpa" ADD CONSTRAINT "ReceitaAnteriorPpa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaAnteriorPpa" ADD CONSTRAINT "ReceitaAnteriorPpa_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrioridadeLdo" ADD CONSTRAINT "PrioridadeLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrioridadeLdo" ADD CONSTRAINT "PrioridadeLdo_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAnualLdo" ADD CONSTRAINT "MetaAnualLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiscoFiscal" ADD CONSTRAINT "RiscoFiscal_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenunciaReceitaLdo" ADD CONSTRAINT "RenunciaReceitaLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlienacaoBemLdo" ADD CONSTRAINT "AlienacaoBemLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacaoAlienacaoLdo" ADD CONSTRAINT "AplicacaoAlienacaoLdo_alienacaoId_fkey" FOREIGN KEY ("alienacaoId") REFERENCES "AlienacaoBemLdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividaConsolidadaLdo" ADD CONSTRAINT "DividaConsolidadaLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjecaoAtuarialRpps" ADD CONSTRAINT "ProjecaoAtuarialRpps_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MargemExpansaoLdo" ADD CONSTRAINT "MargemExpansaoLdo_ldoId_fkey" FOREIGN KEY ("ldoId") REFERENCES "LeiDiretrizesOrcamentarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- OS CHECKS — as regras que o banco sustenta contra o INSERT direto.
--
-- ⚠️ ELES MORAM AQUI, NÃO EM `prisma/sql/`. O Prisma não modela CHECK; se ele
-- viver fora da migration, um `migrate reset` recria o banco SEM a constraint e
-- ninguém percebe até um valor inválido entrar.
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ O QUADRIÊNIO TEM QUATRO ANOS. EXATAMENTE.
--
-- CF art. 165 §1º: o PPA cobre quatro exercícios. Um "PPA" de dois ou de cinco
-- anos não é um PPA — é outra coisa, e o TCE o recusaria. O Zod barra na entrada
-- do serviço; este CHECK barra o INSERT direto, que dribla o serviço (script de
-- migração, correção manual no banco, seed apressado).
--
-- `anoFim - anoInicio = 3` porque as duas pontas são INCLUSIVAS: 2026 a 2029 são
-- quatro exercícios e a diferença é três. Escrever `= 4` seria o erro clássico
-- de intervalo fechado.
ALTER TABLE "PlanoPlurianual"
  ADD CONSTRAINT "ck_plano_plurianual_quadrienio"
  CHECK ("anoFim" - "anoInicio" = 3);

-- ⚠️ O DOMÍNIO DO PASSIVO CONTINGENTE — 1 a 8, mais 99 ("outros").
--
-- Ele veio do ENUNCIADO deste PR, que o leu no manual v44. O manual NÃO está
-- transcrito aqui, e é por isso que este é um CHECK e não um enum do Prisma: um
-- enum congelaria em migration um rol ainda não conferido contra a fonte, e
-- mudá-lo depois exigiria `ALTER TYPE`. O CHECK é uma linha de SQL para corrigir
-- quando a spec chegar.
--
-- ⚠️ O 99 EXISTE DE PROPÓSITO. Sem "outros", um passivo que não se encaixa nos
-- oito viraria uma classificação ERRADA — e classificação errada num anexo da
-- LRF é pior do que a honestidade de "outros".
ALTER TABLE "RiscoFiscal"
  ADD CONSTRAINT "ck_risco_fiscal_codigo_passivo"
  CHECK ("codigoPassivo" IN ('1','2','3','4','5','6','7','8','99'));

-- ⚠️ O DOMÍNIO DA APLICAÇÃO DO PRODUTO DA ALIENAÇÃO — 1 a 5.
-- Mesma procedência e mesmo raciocínio do CHECK acima.
ALTER TABLE "AplicacaoAlienacaoLdo"
  ADD CONSTRAINT "ck_aplicacao_alienacao_tipo"
  CHECK ("tipoAplicacao" IN ('1','2','3','4','5'));

-- ⚠️ A VIGÊNCIA DA LDO TEM DE TER DURAÇÃO. Fim <= início é erro de digitação que
-- nenhum relatório detecta — ele só produz um período vazio que some das
-- consultas por intervalo.
ALTER TABLE "LeiDiretrizesOrcamentarias"
  ADD CONSTRAINT "ck_ldo_vigencia_com_duracao"
  CHECK ("fimVigencia" > "inicioVigencia");

-- ⚠️ O TRÂMITE TEM ORDEM. A devolução do Legislativo não precede o envio, e a
-- sanção não precede a devolução. As três datas são NULLABLE (o ciclo é
-- sequencial e a LDO é cadastrada antes de tramitar), então cada regra só vale
-- quando as DUAS pontas existem — daí o `IS NULL OR`.
--
-- Sem isto, uma data digitada trocada produziria uma LDO "sancionada antes de
-- enviada", e o extrato de trâmite contaria uma história impossível.
ALTER TABLE "LeiDiretrizesOrcamentarias"
  ADD CONSTRAINT "ck_ldo_tramite_em_ordem"
  CHECK (
    ("dataEnvioLegislativo" IS NULL OR "dataDevolucaoExecutivo" IS NULL
       OR "dataDevolucaoExecutivo" >= "dataEnvioLegislativo")
    AND
    ("dataDevolucaoExecutivo" IS NULL OR "dataSancao" IS NULL
       OR "dataSancao" >= "dataDevolucaoExecutivo")
  );

-- ⚠️ VALORES QUE NÃO PODEM SER NEGATIVOS.
--
-- E note quais NÃO estão nesta lista, porque a ausência é a decisão:
--   · `MetaAnualLdo.resultadoNominal` — déficit é negativo, e é o caso comum;
--   · `ProjecaoAtuarialRpps.resultadoPrevidenciario` e `saldoFinanceiro` — um
--     RPPS deficitário é exatamente o que a projeção atuarial existe para
--     revelar. Um CHECK de positividade ali impediria o ente de declarar o
--     rombo, que é o oposto do que a LRF quer.
ALTER TABLE "ProgramaPpa"
  ADD CONSTRAINT "ck_programa_ppa_valor_nao_negativo"
  CHECK ("valorPrevisto" >= 0);

ALTER TABLE "AcaoPpa"
  ADD CONSTRAINT "ck_acao_ppa_metas_nao_negativas"
  CHECK ("metaFisica" >= 0 AND "metaFinanceira" >= 0);

ALTER TABLE "PrevisaoReceitaPpa"
  ADD CONSTRAINT "ck_previsao_receita_ppa_nao_negativa"
  CHECK ("valor" >= 0);

ALTER TABLE "ReceitaAnteriorPpa"
  ADD CONSTRAINT "ck_receita_anterior_ppa_nao_negativa"
  CHECK ("valor" >= 0);

ALTER TABLE "PrioridadeLdo"
  ADD CONSTRAINT "ck_prioridade_ldo_meta_nao_negativa"
  CHECK ("meta" >= 0);

ALTER TABLE "RiscoFiscal"
  ADD CONSTRAINT "ck_risco_fiscal_valores_nao_negativos"
  CHECK ("valorPassivo" >= 0 AND "valorProvidencia" >= 0);

ALTER TABLE "RenunciaReceitaLdo"
  ADD CONSTRAINT "ck_renuncia_receita_valores_nao_negativos"
  CHECK ("valor" >= 0 AND "valorCompensacao" >= 0);

ALTER TABLE "AlienacaoBemLdo"
  ADD CONSTRAINT "ck_alienacao_bem_valor_nao_negativo"
  CHECK ("valorAlienacao" >= 0);

ALTER TABLE "AplicacaoAlienacaoLdo"
  ADD CONSTRAINT "ck_aplicacao_alienacao_valor_nao_negativo"
  CHECK ("valor" >= 0);

-- ⚠️ AS METAS ANUAIS: total >= primária, nos dois lados.
--
-- A receita PRIMÁRIA é a total menos as financeiras (operações de crédito,
-- alienações, rendimentos de aplicação). Ela é, por construção, MENOR OU IGUAL à
-- total — e uma primária maior que a total é sinal de que as duas foram
-- preenchidas em colunas trocadas, que é o erro que este CHECK pega.
--
-- ⚠️ E É POR ISSO QUE `resultadoPrimario` NÃO É COLUNA: ele é
-- `receitaPrimaria − despesaPrimaria`, derivado das duas parcelas que ESTÃO
-- gravadas. Guardá-lo seria cache de dinheiro — o bug do TR 5.9. A derivação
-- vive em `resultadoPrimario()` no domínio, e é UMA.
ALTER TABLE "MetaAnualLdo"
  ADD CONSTRAINT "ck_meta_anual_primaria_nao_excede_total"
  CHECK ("receitaPrimaria" <= "receitaTotal" AND "despesaPrimaria" <= "despesaTotal");

ALTER TABLE "MetaAnualLdo"
  ADD CONSTRAINT "ck_meta_anual_valores_nao_negativos"
  CHECK (
    "receitaTotal" >= 0 AND "receitaPrimaria" >= 0
    AND "despesaTotal" >= 0 AND "despesaPrimaria" >= 0
    AND "dividaPublicaConsolidada" >= 0 AND "dividaConsolidadaLiquida" >= 0
  );

-- ⚠️ A DÍVIDA CONSOLIDADA: deduções não excedem o estoque, e a RCL é positiva.
-- RCL zero ou negativa faria o `percentualRcl` perder sentido — e é ele que o
-- limite do Senado (Resolução 40) lê.
ALTER TABLE "DividaConsolidadaLdo"
  ADD CONSTRAINT "ck_divida_consolidada_coerente"
  CHECK (
    "dividaConsolidada" >= 0
    AND "deducoes" >= 0
    AND "deducoes" <= "dividaConsolidada"
    AND "receitaCorrenteLiquida" > 0
    AND "percentualRcl" >= 0
  );

-- ⚠️ O RPPS: receitas e despesas não são negativas — mas o RESULTADO pode ser,
-- e por isso ele não está aqui. Ver a nota acima.
ALTER TABLE "ProjecaoAtuarialRpps"
  ADD CONSTRAINT "ck_projecao_rpps_parcelas_nao_negativas"
  CHECK ("receitasPrevidenciarias" >= 0 AND "despesasPrevidenciarias" >= 0);

ALTER TABLE "MargemExpansaoLdo"
  ADD CONSTRAINT "ck_margem_expansao_parcelas_nao_negativas"
  CHECK (
    "aumentoPermanenteReceita" >= 0
    AND "reducaoPermanenteDespesa" >= 0
    AND "novasDespesasObrigatorias" >= 0
  );

-- ⚠️ O INDICADOR NÃO TEM CHECK DE SINAL, e a ausência é deliberada: um indicador
-- pode ser negativo (saldo migratório, variação do PIB, resultado). Impor
-- positividade aqui recusaria justamente os indicadores que medem perda.
