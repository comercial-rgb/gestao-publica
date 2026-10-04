-- ═══ V34 — DIAGNÓSTICO, SOMENTE LEITURA: restos inscritos em exercício encerrado com anulação parcial ═══
--
-- POR QUE EXISTE. Até f947aaf (V33) o encerramento somava a família do empenho sem o estorno da anulação parcial
-- (a parcial estornada continuava descontando) e tratava a linha da parcial como fato. Um exercício encerrado antes da
-- correção pode ter restos inscritos a MAIS ou a MENOS. Esta consulta recalcula, pela regra ATUAL
-- (`situacaoDosEmpenhos` + `calcularInscricoes`, M08), só com as linhas GRAVADAS ATÉ O INSTANTE DO ENCERRAMENTO, e
-- compara com o `valorInscrito`. Ela NÃO executa o algoritmo antigo, NÃO grava nada e NÃO corrige nada.
--
-- COMO RODAR (só com autorização direta para ler a produção):
--   psql "<url do banco>" -v ON_ERROR_STOP=1 -f DIAGNOSTICO-RESTOS-ANULACAO-PARCIAL.sql
-- A transação é READ ONLY e termina em ROLLBACK.
--
-- O QUE SAI: uma linha por (empenho, tipo) em que o recálculo difere do inscrito, ou em que só um dos lados existe.
-- Diferença encontrada NÃO se ajusta aqui: vira relação de fatos com valor esperado, valor registrado e proposta de
-- regularização (cancelamento ou complemento de inscrição pelos atos do M08), decidida pela contabilidade do ente.
--
-- REGRAS (as mesmas do código, por linha):
--   líquido de um fato    = valor, se não estornado; menos as parciais vivas dele (parcial viva = não estornada);
--   empenhado do empenho  = líquido do empenho original;
--   liquidado             = Σ líquido das liquidações originais do empenho;
--   pago                  = Σ líquido dos pagamentos originais das liquidações originais NÃO estornadas;
--   processado            = liquidado − pago      (inscreve se > 0);
--   não processado        = empenhado − liquidado (inscreve se > 0).
-- "Até o instante" = criadoEm <= o criadoEm do EncerramentoExercicio.

BEGIN TRANSACTION READ ONLY;

WITH enc AS (
  SELECT x.ano, en."criadoEm" AS t
  FROM "Exercicio" x
  JOIN "EncerramentoExercicio" en ON en."exercicioId" = x.id
),
-- Empenhos originais dos exercícios encerrados, com o instante do encerramento.
emp AS (
  SELECT o.id, o.numero, o.valor, f.exercicio AS ano, enc.t
  FROM "Empenho" o
  JOIN "FichaOrcamentaria" f ON f.id = o."fichaId"
  JOIN enc ON enc.ano = f.exercicio
  WHERE o."estornoDeId" IS NULL AND o."anulacaoParcialDeId" IS NULL AND o."criadoEm" <= enc.t
),
emp_liq AS (
  SELECT e.id AS empenho_id,
    CASE WHEN EXISTS (SELECT 1 FROM "Empenho" z WHERE z."estornoDeId" = e.id AND z."criadoEm" <= e.t) THEN 0
    ELSE e.valor - COALESCE((
      SELECT SUM(p.valor) FROM "Empenho" p
      WHERE p."anulacaoParcialDeId" = e.id AND p."criadoEm" <= e.t
        AND NOT EXISTS (SELECT 1 FROM "Empenho" z WHERE z."estornoDeId" = p.id AND z."criadoEm" <= e.t)
    ), 0) END AS empenhado
  FROM emp e
),
liq AS (
  SELECT l.id, l."empenhoId" AS empenho_id, e.t,
    EXISTS (SELECT 1 FROM "Liquidacao" z WHERE z."estornoDeId" = l.id AND z."criadoEm" <= e.t) AS estornada,
    CASE WHEN EXISTS (SELECT 1 FROM "Liquidacao" z WHERE z."estornoDeId" = l.id AND z."criadoEm" <= e.t) THEN 0
    ELSE l.valor - COALESCE((
      SELECT SUM(p.valor) FROM "Liquidacao" p
      WHERE p."anulacaoParcialDeId" = l.id AND p."criadoEm" <= e.t
        AND NOT EXISTS (SELECT 1 FROM "Liquidacao" z WHERE z."estornoDeId" = p.id AND z."criadoEm" <= e.t)
    ), 0) END AS liquido
  FROM "Liquidacao" l
  JOIN emp e ON e.id = l."empenhoId"
  WHERE l."estornoDeId" IS NULL AND l."anulacaoParcialDeId" IS NULL AND l."criadoEm" <= e.t
),
pag AS (
  SELECT l.empenho_id,
    CASE WHEN EXISTS (SELECT 1 FROM "Pagamento" z WHERE z."estornoDeId" = pg.id AND z."criadoEm" <= l.t) THEN 0
    ELSE pg.valor - COALESCE((
      SELECT SUM(p.valor) FROM "Pagamento" p
      WHERE p."anulacaoParcialDeId" = pg.id AND p."criadoEm" <= l.t
        AND NOT EXISTS (SELECT 1 FROM "Pagamento" z WHERE z."estornoDeId" = p.id AND z."criadoEm" <= l.t)
    ), 0) END AS liquido
  FROM "Pagamento" pg
  JOIN liq l ON l.id = pg."liquidacaoId" AND NOT l.estornada
  WHERE pg."estornoDeId" IS NULL AND pg."anulacaoParcialDeId" IS NULL AND pg."criadoEm" <= l.t
),
situacao AS (
  SELECT e.id AS empenho_id, e.numero, e.ano, el.empenhado,
    COALESCE((SELECT SUM(liquido) FROM liq WHERE liq.empenho_id = e.id), 0) AS liquidado,
    COALESCE((SELECT SUM(liquido) FROM pag WHERE pag.empenho_id = e.id), 0) AS pago
  FROM emp e JOIN emp_liq el ON el.empenho_id = e.id
),
esperado AS (
  SELECT empenho_id, numero, ano, 'PROCESSADO' AS tipo, liquidado - pago AS valor FROM situacao WHERE liquidado - pago > 0
  UNION ALL
  SELECT empenho_id, numero, ano, 'NAO_PROCESSADO', empenhado - liquidado FROM situacao WHERE empenhado - liquidado > 0
),
inscrito AS (
  SELECT i."empenhoId" AS empenho_id, i."exercicioOrigem" AS ano, i.tipo::text AS tipo, i."valorInscrito" AS valor
  FROM "InscricaoRestosAPagar" i JOIN enc ON enc.ano = i."exercicioOrigem"
)
SELECT COALESCE(es.ano, ins.ano) AS exercicio,
       COALESCE(es.empenho_id, ins.empenho_id) AS empenho_id,
       (SELECT numero FROM "Empenho" WHERE id = COALESCE(es.empenho_id, ins.empenho_id)) AS empenho,
       COALESCE(es.tipo, ins.tipo) AS tipo,
       es.valor AS valor_esperado,
       ins.valor AS valor_inscrito,
       COALESCE(ins.valor, 0) - COALESCE(es.valor, 0) AS diferenca,
       EXISTS (SELECT 1 FROM "Empenho" p WHERE p."anulacaoParcialDeId" = COALESCE(es.empenho_id, ins.empenho_id)) AS tem_parcial_no_empenho
FROM esperado es
FULL OUTER JOIN inscrito ins ON ins.empenho_id = es.empenho_id AND ins.tipo = es.tipo AND ins.ano = es.ano
WHERE COALESCE(es.valor, -1) <> COALESCE(ins.valor, -1)
ORDER BY 1, 3, 4;

-- E o resumo: quantos exercícios encerrados, quantas inscrições, quantas com diferença.
SELECT (SELECT COUNT(*) FROM "EncerramentoExercicio") AS exercicios_encerrados,
       (SELECT COUNT(*) FROM "InscricaoRestosAPagar") AS inscricoes,
       (SELECT COUNT(*) FROM "Empenho" WHERE "anulacaoParcialDeId" IS NOT NULL) AS parciais_de_empenho,
       (SELECT COUNT(*) FROM "Liquidacao" WHERE "anulacaoParcialDeId" IS NOT NULL) AS parciais_de_liquidacao,
       (SELECT COUNT(*) FROM "Pagamento" WHERE "anulacaoParcialDeId" IS NOT NULL) AS parciais_de_pagamento;

ROLLBACK;
