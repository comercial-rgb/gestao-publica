-- V13 (TR 5.12.50) — O PARAMETRO DO ADIANTAMENTO SALARIAL, E O CHECK QUE PASSA A CLASSIFICAR O
-- TIPO NOVO.
--
-- Esta migration USA os valores de enum criados em 20261018090000 e 20261018090100 — por isso ela
-- e um arquivo separado (o Postgres recusa usar um valor de enum na transacao que o criou).
--
-- ADITIVA: um tipo novo, uma tabela nova, e a SUBSTITUICAO de um CHECK por um mais largo. Zero
-- DROP de tabela ou coluna, zero linha tocada, zero migration reescrita.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. O CHECK DO EXERCICIO PASSA A CLASSIFICAR `ADIANTAMENTO_SALARIAL`
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ISTO CORRIGE O QUE A VARREDURA V12 DEU POR RESOLVIDO. Ela registrou que o CHECK "nao muda
-- de forma" porque o tipo novo e POR_COMPETENCIA, "lado que MENSAL ja ocupa". A FORMA de fato nao
-- muda — mas a V11 V9.4 substituiu o `<>` por DUAS LISTAS EXPLICITAS justamente para FALHAR
-- FECHADO no tipo seguinte: um valor que nao apareca em NENHUMA das duas torna os dois lados do
-- `OR` falsos e nenhuma linha daquele tipo grava. Sem este ALTER, `abrirFolha` de um adiantamento
-- salarial seria recusada pelo banco no primeiro INSERT. Conferido no arquivo
-- `20261015090100_v11_v94_exercicio_por_recorrencia_do_tipo/migration.sql`, nao presumido.
--
-- ⚠️ SUBSTITUIR UM CHECK TEM PRECEDENTE ACEITO AQUI (`20260913090000_v4_cnpj_alfanumerico...` e a
-- propria `20261015090100`): o DROP e do CHECK antigo, para dar lugar ao mais largo — a unica
-- forma de ampliar um CHECK no Postgres. TODA linha que o anterior aceitava continua aceita.
--
-- ⚠️ E A LISTA NAO E A FONTE: ela e o RETRATO de `NATUREZA_DO_TIPO_DE_FOLHA`
-- (`modules/m33-folha/dominio.ts`), um `Record<TipoDeFolha, ...>` EXAUSTIVO. A concordancia entre
-- os dois e afirmada POR EFEITO em `m33-recorrencia-do-tipo-de-folha.test.ts`, que le os valores
-- do enum DO BANCO e tenta gravar as duas formas para cada um.

ALTER TABLE "FolhaDePagamento" DROP CONSTRAINT IF EXISTS "ck_folha_exercicio_por_tipo";

ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "ck_folha_exercicio_por_tipo" CHECK (
    -- POR COMPETENCIA: recorrem dentro do ano, e por isso nao tem exercicio. Em Postgres varios
    -- NULL convivem num indice unico, entao o `@@unique([exercicio, tipo])` nao estorva nenhum.
    ("tipo" IN ('MENSAL', 'MENSAL_COMPLEMENTAR', 'ADIANTAMENTO_SALARIAL') AND "exercicio" IS NULL)
    -- POR EXERCICIO: um por ano, e o exercicio TEM de coincidir com o ano da competencia.
    OR ("tipo" IN ('ADIANTAMENTO_DECIMO_TERCEIRO', 'DECIMO_TERCEIRO')
        AND "exercicio" IS NOT NULL
        AND "exercicio" = CAST(substring("competencia" FROM 1 FOR 4) AS INTEGER))
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AS DUAS PRATICAS SUPORTADAS
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ESTE ENUM E A LISTA DO QUE O SISTEMA SABE CALCULAR E VERIFICAR, e nao um inventario do que
-- os municipios praticam. Um ente cuja regra nao seja nenhuma das duas recebe RECUSA, e a
-- pendencia tem nome: `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`. Encaixar a forca na mais
-- parecida seria inventar a norma do ente.
CREATE TYPE "BaseDoAdiantamentoSalarial" AS ENUM ('REMUNERACAO_DO_MES_ANTERIOR', 'REMUNERACAO_PROJETADA_DO_MES');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. O PARAMETRO DA COMPETENCIA
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POR COMPETENCIA, E NAO POR EXERCICIO — e a diferenca para `ParametroDoDecimoTerceiro`, de
-- quem esta tabela copia a FORMA. O vale e mensal, e o ente pode mudar o percentual em julho sem
-- reescrever o que valeu em junho. E e esta granularidade que faz "alteracao de parametro nao
-- reescreve calculo fechado" valer por construcao: a folha fechada de junho cita na memoria o
-- `id` e a `versao` que a apuraram, e e ESSA versao que a mensal de junho le para abater.
--
-- ⚠️ NENHUMA MIGRATION DE DADOS: a tabela nasce VAZIA. O TR nao fixa percentual nem base
-- (procurado em `docs/edital/`, nao localizado), entao um seed aqui seria norma inventada.

CREATE TABLE "ParametroDoAdiantamentoSalarial" (
    "id" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "versao" INTEGER NOT NULL,
    "percentualDoAdiantamento" DECIMAL(7,4) NOT NULL,
    "baseDoAdiantamento" "BaseDoAdiantamentoSalarial" NOT NULL,
    "estadoMinimoParaAbater" "EstadoMinimoDoAdiantamento" NOT NULL,
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
    CONSTRAINT "ParametroDoAdiantamentoSalarial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParametroDoAdiantamentoSalarial_competencia_versao_key" ON "ParametroDoAdiantamentoSalarial"("competencia", "versao");
CREATE INDEX "ParametroDoAdiantamentoSalarial_competencia_idx" ON "ParametroDoAdiantamentoSalarial"("competencia");

ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ParametroDoAdiantamentoSalarial_rubricaDoAdiantamentoId_fkey"
    FOREIGN KEY ("rubricaDoAdiantamentoId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ParametroDoAdiantamentoSalarial_rubricaDoAbatimentoId_fkey"
    FOREIGN KEY ("rubricaDoAbatimentoId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OS LIMITES DOS NUMEROS DO ENTE ──────────────────────────────────────────
--
-- ⚠️ ELES IMPEDEM O IMPOSSIVEL, NAO FIXAM O CERTO. Nao dizem que o vale e 40%: dizem que nao
-- existe vale de 150% nem de 0%. A norma continua sendo do ente; a aritmetica e do banco.
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_versao_positiva"
    CHECK ("versao" >= 1);

-- ⚠️ MAIOR QUE ZERO, E O `>` NAO E DESCUIDO DE COPIA. No 13o o percentual da 1a parcela pode ser
-- zero (ente que nao paga adiantamento simplesmente nao abre a folha). Aqui a folha SO existe
-- para pagar o vale: um percentual zero produziria uma folha inteira de contracheques de ZERO,
-- que fecha, empenha e liquida sem nada acusar adiante — e o operador sairia convencido de que
-- pagou. Quem nao paga vale nao cadastra parametro.
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_percentual"
    CHECK ("percentualDoAdiantamento" > 0 AND "percentualDoAdiantamento" <= 1);

-- ⚠️ A COMPETENCIA TEM DE SER UMA COMPETENCIA. "AAAA-MM" com mes de 01 a 12 — a mesma forma que
-- `FolhaDePagamento.competencia` carrega, e sem isto um "2026-13" gravaria e so apareceria como
-- folha que nunca casa com nenhuma.
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_competencia"
    CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ⚠️ AS DUAS RUBRICAS SAO DUAS. A mesma no papel de provento e no de abatimento faria a linha
-- somar e subtrair de si, e o vale sairia liquido zero com os dois lados registrados.
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_rubricas_distintas"
    CHECK ("rubricaDoAdiantamentoId" <> "rubricaDoAbatimentoId");

-- ── O ATO: COERENCIA, NAO COMPRIMENTO ───────────────────────────────────────
--
-- ⚠️ OS MESMOS QUATRO DO PARAMETRO DO 13o, E PELO MESMO MOTIVO MEDIDO: "conforme a legislacao
-- vigente" tem 29 caracteres e passaria por qualquer piso de tamanho. O ano plausivel e conferido
-- aqui em faixa larga e no SERVICO contra a DATA CIVIL DO ENTE — o banco nao sabe que dia e hoje
-- no fuso do municipio, e cravar `EXTRACT(YEAR FROM now())` aqui seria comparar com UTC.
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_ato_numero_tem_digito"
    CHECK ("atoNumero" ~ '[0-9]');
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_ato_ano_plausivel"
    CHECK ("atoAno" >= 1800 AND "atoAno" <= 2200);
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_ato_dispositivo"
    CHECK (length(btrim("atoDispositivo")) >= 3);
ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ck_parametro_adiant_sal_ato_ementa"
    CHECK (btrim("atoEmenta") ~ '\S+\s+\S+\s+\S+');
