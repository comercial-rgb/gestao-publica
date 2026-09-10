-- ============================================================================
-- COMPETENCIA EM MovimentoDotacao
--
-- Decidido em docs/adr/ADR-competencia-no-movimento-de-dotacao.md (aceito,
-- 2026-09-10, alternativa A). Tres passos, nesta ordem, numa transacao:
--   1. coluna NULLABLE (aditiva, sem DROP)
--   2. backfill por ordem de precedencia declarada no ADR
--   3. NOT NULL
--
-- ATENCAO AO PAPEL. `MovimentoDotacao` NAO consta de ESCRITA_MUTAVEL_DO_RUNTIME
-- (prisma/papel-runtime.ts) e o papel `gestao_app` tem apenas INSERT e SELECT --
-- medido em 2026-09-10. O UPDATE do passo 2 roda pelo papel de MIGRACAO
-- (`gestao`), uma unica vez, aqui dentro. O grant de `gestao_app` NAO e
-- afrouxado, nem durante nem depois: para o runtime a tabela continua
-- estritamente append-only.
-- ============================================================================

-- ── 1. Aditivo ──────────────────────────────────────────────────────────────
ALTER TABLE "MovimentoDotacao" ADD COLUMN "competencia" TIMESTAMP(3);
ALTER TABLE "MovimentoDotacao" ADD COLUMN "competenciaDerivada" BOOLEAN NOT NULL DEFAULT false;

-- ── 2a. Fonte 1: a perna no razao ───────────────────────────────────────────
-- `LancamentoContabil.dataTransacao` desta perna E o `p.data` que o chamador
-- passou a registrarMovimentoDotacao e que a funcao gravou no razao e descartou
-- no movimento. Isto recupera o valor; nao o adivinha.
--
-- MIN() e deliberado: se um movimento tivesse duas pernas (nao tem -- ha uma
-- por movimento, com origemId = movimento.id), um UPDATE ... FROM escolheria
-- uma linha arbitraria em silencio. O agregado torna o resultado deterministico.
UPDATE "MovimentoDotacao" m
   SET "competencia" = sub."dataTransacao"
  FROM (
        SELECT l."origemId" AS mov_id, MIN(l."dataTransacao") AS "dataTransacao"
          FROM "LancamentoContabil" l
         GROUP BY l."origemId"
       ) sub
 WHERE m.id = sub.mov_id
   AND m."competencia" IS NULL;

-- ── 2b. Fonte 2: a data do empenho ──────────────────────────────────────────
-- EMPENHO e EMPENHO_ANULADO nao lancam pelo roteiro orcamentario (o roteiro vem
-- do chamador de empenhar()), entao nao tem perna com origemId = movimento.id.
-- A data do fato deles esta em `Empenho.data`, alcancavel por `origemId`.
UPDATE "MovimentoDotacao" m
   SET "competencia" = e."data"
  FROM "Empenho" e
 WHERE e.id = m."origemId"
   AND m."competencia" IS NULL;

-- ── 2c. Fonte 3: derivada por ausencia ──────────────────────────────────────
-- O que sobrou nao tem ato de origem com data -- hoje, as reservas, que nao tem
-- data propria (declarado em modules/m05-despesa/adapter-prisma.ts). Usa-se
-- `criadoEm` E MARCA-SE A LINHA. A marca e o que permite reencontra-las.
UPDATE "MovimentoDotacao"
   SET "competencia" = "criadoEm",
       "competenciaDerivada" = true
 WHERE "competencia" IS NULL;

-- ── 3. NOT NULL ─────────────────────────────────────────────────────────────
-- Se 2a/2b/2c tiverem deixado alguma linha, este comando FALHA e a migration
-- inteira e revertida. E o desejado: melhor a migration parar do que a coluna
-- nascer meio vazia e o corte por data responder NULL em silencio.
ALTER TABLE "MovimentoDotacao" ALTER COLUMN "competencia" SET NOT NULL;

-- ── Indice do corte por data ────────────────────────────────────────────────
CREATE INDEX "MovimentoDotacao_fichaId_competencia_idx"
    ON "MovimentoDotacao"("fichaId", "competencia");
