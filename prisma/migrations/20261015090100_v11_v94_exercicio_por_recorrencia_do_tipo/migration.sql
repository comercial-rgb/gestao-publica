-- V11 V9.4 — O CHECK DO EXERCÍCIO PASSA A AFIRMAR A PROPRIEDADE, EM VEZ DE ENUMERAR UMA FORMA.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- O QUE ESTAVA ERRADO, E NÃO ERA UM DEFEITO DE VALOR — ERA DE FORMA
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- `ck_folha_exercicio_por_tipo` nasceu em `20261011091000` assim:
--
--     ("tipo" = 'MENSAL' AND "exercicio" IS NULL)
--     OR ("tipo" <> 'MENSAL' AND "exercicio" IS NOT NULL AND "exercicio" = ano da competencia)
--
-- ⚠️ ISSO ENUMERA UM EXEMPLAR ('MENSAL') E JOGA TODO O RESTO NO `<>`. A propriedade verdadeira é
-- outra: os tipos que RECORREM dentro do ano (vários por exercício, um por competência) têm
-- `exercicio` NULO; os que são ÚNICOS NO ANO têm `exercicio` NÃO NULO e coerente com a
-- competência. `MENSAL` é só o primeiro exemplar do primeiro grupo — e a mensal COMPLEMENTAR é o
-- segundo. Com a forma antiga, `MENSAL_COMPLEMENTAR` cairia no `<>` e o banco EXIGIRIA dela um
-- exercício que ela não tem por que ter, em silêncio, no primeiro `INSERT`.
--
-- ⚠️ E A FORMA NOVA FALHA FECHADA PARA O PRÓXIMO TIPO. Um valor novo do enum que não apareça em
-- NENHUMA das duas listas torna os dois lados do `OR` falsos: nenhuma linha daquele tipo grava, e
-- quem estiver construindo descobre no primeiro `INSERT`, não numa folha errada em produção. Com
-- o `<>` antigo o tipo novo caía SILENCIOSAMENTE no grupo "por exercício" — que é o pior dos dois
-- resultados, porque parece funcionar.
--
-- ⚠️ A LISTA NÃO É A FONTE: ela é o RETRATO de `NATUREZA_DO_TIPO_DE_FOLHA`
-- (`modules/m33-folha/dominio.ts`), um `Record<TipoDeFolha, ...>` EXAUSTIVO — um tipo novo no
-- enum não compila até ser classificado. E a divergência entre o Record e este SQL é afirmada
-- POR EFEITO em `m33-recorrencia-do-tipo-de-folha.test.ts`, que lê os valores do enum DO BANCO e
-- tenta gravar as duas formas para cada um: exatamente uma tem de passar, e tem de ser a que o
-- Record declara. Listas paralelas sem prova foi o defeito que a V11 V9.1 pagou com
-- `ABATIMENTO_DO_ADIANTAMENTO_DO_13` faltando no `.prisma`.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ADITIVA NO QUE IMPORTA: ZERO DADO PERDIDO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ SUBSTITUIR UM CHECK TEM PRECEDENTE ACEITO NESTE REPOSITÓRIO:
-- `20260913090000_v4_cnpj_alfanumerico_nos_checks` — "o DROP é do CHECK antigo, para dar lugar ao
-- mais largo, a única forma de ampliar um CHECK no Postgres". Nenhuma linha é apagada, nenhuma
-- coluna muda de tipo, e TODA linha que o CHECK antigo aceitava continua aceita: 'MENSAL' com
-- exercício nulo e os dois tipos de 13º com exercício coerente são, letra por letra, o que as
-- duas listas abaixo dizem. O que muda é só o destino do que ainda não existe.

ALTER TABLE "FolhaDePagamento" DROP CONSTRAINT IF EXISTS "ck_folha_exercicio_por_tipo";

ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "ck_folha_exercicio_por_tipo" CHECK (
    -- POR COMPETÊNCIA: recorrem dentro do ano (quantas competências o ano tiver), e por isso não
    -- têm exercício. Em Postgres vários NULL convivem num índice único, então o
    -- `@@unique([exercicio, tipo])` que guarda o 13º não estorva nenhum destes.
    ("tipo" IN ('MENSAL', 'MENSAL_COMPLEMENTAR') AND "exercicio" IS NULL)
    -- POR EXERCÍCIO: um por ano, e o exercício TEM de coincidir com o ano da competência. Sem
    -- isto, uma folha de 13º de 2026 poderia ser gravada com `exercicio = 2025`: o cálculo leria
    -- os avos de um ano e a memória citaria outro, sem nada acusar.
    OR ("tipo" IN ('ADIANTAMENTO_DECIMO_TERCEIRO', 'DECIMO_TERCEIRO')
        AND "exercicio" IS NOT NULL
        AND "exercicio" = CAST(substring("competencia" FROM 1 FOR 4) AS INTEGER))
);
