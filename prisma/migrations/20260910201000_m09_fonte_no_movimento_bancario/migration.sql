-- ============================================================================
-- M09 — a FONTE do movimento bancario, OBRIGATORIA.
--
-- Desde que a conta admite varias fontes (TR 5.10.2.6, ADR de 2026-09-10), a fonte
-- deixou de poder ser inferida da conta. Conta multifonte nao significa movimento
-- sem fonte: significa o oposto — a fonte precisa ser DECLARADA.
--
-- Tres passos, como o da competencia: nullable, backfill, NOT NULL.
-- ============================================================================

ALTER TABLE "MovimentoBancario" ADD COLUMN "fonteId" TEXT;

-- ⚠️ BACKFILL PELA FONTE PADRAO DA CONTA. Os movimentos existentes nasceram quando
-- a conta tinha UMA fonte — aquela era, necessariamente, a fonte deles. Nao ha
-- ambiguidade a resolver, e por isso nao ha coluna de "derivado por ausencia" aqui
-- (diferente da competencia, onde havia caso sem origem identificavel).
UPDATE "MovimentoBancario" m
   SET "fonteId" = c."fonteId"
  FROM "ContaBancaria" c
 WHERE c."id" = m."contaBancariaId"
   AND m."fonteId" IS NULL;

-- Se sobrar linha sem fonte, a migration INTEIRA cai. Melhor parar do que a coluna
-- nascer meio vazia e o controle de destinacao responder NULL em silencio.
ALTER TABLE "MovimentoBancario" ALTER COLUMN "fonteId" SET NOT NULL;

CREATE INDEX "MovimentoBancario_fonteId_idx" ON "MovimentoBancario"("fonteId");
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_fonteId_fkey"
  FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
