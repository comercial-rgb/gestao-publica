-- V11 V9.1 — O PARÂMETRO DO 13º DO ENTE, E O QUE A FOLHA PRECISA PARA TER DUAS PARCELAS.
--
-- Esta migration USA os valores de enum criados em 20261011090000 — por isso ela é um arquivo
-- separado (ver o comentário de lá; o Postgres recusa usar na mesma transação que criou).
--
-- ADITIVA: duas tabelas novas, três tipos novos, três colunas nullable em tabelas existentes.
-- Zero DROP, zero coluna reescrita, zero linha tocada. Todo banco existente continua válido:
-- as folhas mensais ficam com `exercicio` nulo e os contracheques com `avosComputados` nulo,
-- que é exatamente o lado "mensal" dos CHECKs abaixo.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. A FOLHA: o exercício como COLUNA, e o elo com o adiantamento que ela abate
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "FolhaDePagamento" ADD COLUMN "exercicio" INTEGER;
ALTER TABLE "FolhaDePagamento" ADD COLUMN "folhaDoAdiantamentoId" TEXT;

ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "FolhaDePagamento_folhaDoAdiantamentoId_fkey"
    FOREIGN KEY ("folhaDoAdiantamentoId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ UM ADIANTAMENTO E UM 13º POR EXERCÍCIO, DITO PELO BANCO. Em Postgres vários NULL convivem
-- num índice único, então a MENSAL (que tem `exercicio` nulo) não é estorvada: continuam valendo
-- quantas competências o ano tiver.
CREATE UNIQUE INDEX "FolhaDePagamento_exercicio_tipo_key" ON "FolhaDePagamento"("exercicio", "tipo");

-- ⚠️ E O EXERCÍCIO TEM DE COINCIDIR COM O ANO DA COMPETÊNCIA. Sem isto, uma folha de 13º de
-- 2026 poderia ser gravada com `exercicio = 2025` e passar por todo o resto: o cálculo leria os
-- avos de um ano e a memória citaria outro, sem nada acusar. O par (nulo na mensal / não nulo e
-- coerente no 13º) é uma coisa só, e por isso é um CHECK só.
ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "ck_folha_exercicio_por_tipo" CHECK (
    ("tipo" = 'MENSAL' AND "exercicio" IS NULL)
    OR ("tipo" <> 'MENSAL' AND "exercicio" IS NOT NULL
        AND "exercicio" = CAST(substring("competencia" FROM 1 FOR 4) AS INTEGER))
);

-- ⚠️ SÓ A FOLHA DE 13º ABATE ADIANTAMENTO, e ela nunca abate a si mesma. Uma folha mensal com
-- `folhaDoAdiantamentoId` preenchido seria um elo que nenhum motor lê — dado morto que o
-- próximo leitor interpretaria como se significasse alguma coisa.
ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "ck_folha_abatimento_so_no_13" CHECK (
    "folhaDoAdiantamentoId" IS NULL OR ("tipo" = 'DECIMO_TERCEIRO' AND "folhaDoAdiantamentoId" <> "id")
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. O CONTRACHEQUE: os avos, e o CHECK que impede o zero de mentir
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "Contracheque" ADD COLUMN "avosComputados" INTEGER;

-- ⚠️ EXATAMENTE UMA DAS DUAS MEDIDAS, POR CONTRACHEQUE. `Contracheque_dias_chk` já exige
-- `diasComputados` entre 0 e 30, e um contracheque de 13º gravaria 0 ali — "zero dia
-- trabalhado", que é falso e some numa soma. Este CHECK diz qual medida vale: avos nulo =
-- mensal (dias mandam); avos não nulo = 13º (dias são zero porque NÃO SE APLICAM).
ALTER TABLE "Contracheque" ADD CONSTRAINT "ck_contracheque_avos_ou_dias" CHECK (
    ("avosComputados" IS NULL)
    OR ("avosComputados" >= 0 AND "diasComputados" = 0)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. O ATO ESTRUTURADO E O PARÂMETRO
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE "EsferaDoAtoNormativo" AS ENUM ('FEDERAL', 'ESTADUAL', 'MUNICIPAL');

CREATE TYPE "TipoDeAtoNormativo" AS ENUM (
    'CONSTITUICAO', 'EMENDA_CONSTITUCIONAL', 'LEI_COMPLEMENTAR', 'LEI', 'LEI_ORGANICA',
    'ESTATUTO_DOS_SERVIDORES', 'MEDIDA_PROVISORIA', 'DECRETO', 'INSTRUCAO_NORMATIVA',
    'PORTARIA', 'RESOLUCAO'
);

CREATE TYPE "BaseDosAvosDoAdiantamento" AS ENUM ('ATE_A_COMPETENCIA', 'EXERCICIO_INTEIRO');

CREATE TABLE "ParametroDoDecimoTerceiro" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "diasMinimosDoAvo" INTEGER NOT NULL,
    "avosNoExercicio" INTEGER NOT NULL,
    "percentualDaPrimeiraParcela" DECIMAL(7,4) NOT NULL,
    "baseDosAvosDoAdiantamento" "BaseDosAvosDoAdiantamento" NOT NULL,
    "decimoTerceiroSofreContribuicao" BOOLEAN NOT NULL,
    "decimoTerceiroSofreIrrf" BOOLEAN NOT NULL,
    "rubricaDoDecimoTerceiroId" TEXT NOT NULL,
    "rubricaDoAdiantamentoId" TEXT NOT NULL,
    "rubricaDoAbatimentoId" TEXT NOT NULL,
    "atoEsfera" "EsferaDoAtoNormativo" NOT NULL,
    "atoTipo" "TipoDeAtoNormativo" NOT NULL,
    "atoNumero" VARCHAR(40) NOT NULL,
    "atoAno" INTEGER NOT NULL,
    "atoDispositivo" VARCHAR(120) NOT NULL,
    "atoEmenta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ParametroDoDecimoTerceiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParametroDoDecimoTerceiro_exercicio_versao_key" ON "ParametroDoDecimoTerceiro"("exercicio", "versao");
CREATE INDEX "ParametroDoDecimoTerceiro_exercicio_idx" ON "ParametroDoDecimoTerceiro"("exercicio");

ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ParametroDoDecimoTerceiro_rubricaDoDecimoTerceiroId_fkey"
    FOREIGN KEY ("rubricaDoDecimoTerceiroId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ParametroDoDecimoTerceiro_rubricaDoAdiantamentoId_fkey"
    FOREIGN KEY ("rubricaDoAdiantamentoId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ParametroDoDecimoTerceiro_rubricaDoAbatimentoId_fkey"
    FOREIGN KEY ("rubricaDoAbatimentoId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OS LIMITES DOS NÚMEROS DO ENTE ──────────────────────────────────────────
--
-- ⚠️ O QUE ESTES CHECKS FAZEM É IMPEDIR O IMPOSSÍVEL, NÃO FIXAR O CERTO. Eles não dizem que o
-- avo é 15 dias nem que a parcela é 50%: dizem que não existe mês com 40 dias, ano com 13 meses
-- nem parcela de 150%. A norma continua sendo do ente; a aritmética é do banco.
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_versao_positiva"
    CHECK ("versao" >= 1);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_dias_minimos"
    CHECK ("diasMinimosDoAvo" >= 1 AND "diasMinimosDoAvo" <= 30);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_avos_no_exercicio"
    CHECK ("avosNoExercicio" >= 1 AND "avosNoExercicio" <= 12);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_percentual_primeira"
    CHECK ("percentualDaPrimeiraParcela" >= 0 AND "percentualDaPrimeiraParcela" <= 1);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_exercicio_plausivel"
    CHECK ("exercicio" >= 1900 AND "exercicio" <= 2200);

-- ⚠️ AS TRÊS RUBRICAS SÃO TRÊS. A mesma rubrica como 13º e como adiantamento faria as duas
-- parcelas caírem no mesmo grupo de empenho; a mesma como provento e como abatimento faria a
-- linha somar e subtrair de si. Nenhum dos dois é recusado por tipo — só por identidade.
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_rubricas_distintas" CHECK (
    "rubricaDoDecimoTerceiroId" <> "rubricaDoAdiantamentoId"
    AND "rubricaDoDecimoTerceiroId" <> "rubricaDoAbatimentoId"
    AND "rubricaDoAdiantamentoId" <> "rubricaDoAbatimentoId"
);

-- ── O ATO: COERÊNCIA, NÃO COMPRIMENTO ───────────────────────────────────────
--
-- ⚠️ ESTES QUATRO CHECKS EXISTEM PORQUE "conforme a legislacao vigente" TEM 29 CARACTERES e
-- passaria por qualquer piso de tamanho. O número do ato tem de ter dígito (é um número); o
-- dispositivo tem de existir (é ele que torna a citação conferível); a ementa tem de ter mais de
-- uma palavra (uma palavra é rótulo, não citação). O ano plausível é conferido aqui em faixa
-- larga e no SERVIÇO contra a data civil do ente — o banco não sabe que dia é hoje no fuso do
-- município, e cravar `EXTRACT(YEAR FROM now())` aqui seria comparar com UTC.
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_ato_numero_tem_digito"
    CHECK ("atoNumero" ~ '[0-9]');
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_ato_ano_plausivel"
    CHECK ("atoAno" >= 1800 AND "atoAno" <= 2200);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_ato_dispositivo_presente"
    CHECK (length(btrim("atoDispositivo")) >= 3);
ALTER TABLE "ParametroDoDecimoTerceiro" ADD CONSTRAINT "ck_parametro_13_ato_ementa_tem_palavras"
    CHECK (btrim("atoEmenta") ~ '\S+\s+\S+\s+\S+');

CREATE TABLE "RubricaDaBaseDoDecimoTerceiro" (
    "id" TEXT NOT NULL,
    "parametroId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RubricaDaBaseDoDecimoTerceiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RubricaDaBaseDoDecimoTerceiro_parametroId_rubricaId_key" ON "RubricaDaBaseDoDecimoTerceiro"("parametroId", "rubricaId");
CREATE INDEX "RubricaDaBaseDoDecimoTerceiro_rubricaId_idx" ON "RubricaDaBaseDoDecimoTerceiro"("rubricaId");

ALTER TABLE "RubricaDaBaseDoDecimoTerceiro" ADD CONSTRAINT "RubricaDaBaseDoDecimoTerceiro_parametroId_fkey"
    FOREIGN KEY ("parametroId") REFERENCES "ParametroDoDecimoTerceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RubricaDaBaseDoDecimoTerceiro" ADD CONSTRAINT "RubricaDaBaseDoDecimoTerceiro_rubricaId_fkey"
    FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
