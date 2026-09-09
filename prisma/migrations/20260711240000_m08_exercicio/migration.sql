-- M08 (bloco 1) — Exercicio + EncerramentoExercicio.
--
-- Aditivo puro: só CREATE TABLE. Nenhuma tabela existente é tocada — o ano
-- continua vivendo como `exercicio Int` na ficha (e nas demais), e os guards
-- resolvem o Exercicio por esse ano. Trocar isso por FK NOT NULL em 6 tabelas
-- seria migração destrutiva sem ganho: `ano` já é a chave natural.
--
-- O BACKFILL no fim é o que importa: bancos que já têm fichas precisam ter os
-- exercícios correspondentes, senão TODA operação passa a ser rejeitada pelo
-- guard (exercício inexistente = fail-closed). É a única forma de a migração ser
-- segura num banco com dados.

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncerramentoExercicio" (
    "id" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "encerradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncerramentoExercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercicio_ano_key" ON "Exercicio"("ano");

-- CreateIndex: 1 encerramento por exercício. O Prisma expressa isto — não é
-- caso de índice parcial em prisma/sql/ (lá é só para o que tem WHERE).
CREATE UNIQUE INDEX "EncerramentoExercicio_exercicioId_key" ON "EncerramentoExercicio"("exercicioId");

-- AddForeignKey
ALTER TABLE "EncerramentoExercicio" ADD CONSTRAINT "EncerramentoExercicio_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL — cria um Exercicio para cada ano já usado no banco.
--
-- Sem isto, um banco com fichas de 2026 passaria a rejeitar todo empenho e toda
-- reserva de 2026, porque o guard não acharia o exercício. `ON CONFLICT DO
-- NOTHING` torna a migração re-executável sem estrago.
-- ---------------------------------------------------------------------------
INSERT INTO "Exercicio" ("id", "ano", "criadoPor")
SELECT gen_random_uuid()::text, anos.ano, 'MIGRACAO'
  FROM (
        SELECT DISTINCT "exercicio" AS ano FROM "FichaOrcamentaria"
        UNION
        SELECT DISTINCT "exercicio" AS ano FROM "ReceitaPrevista"
        UNION
        SELECT DISTINCT "exercicio" AS ano FROM "ReceitaArrecadada"
        UNION
        SELECT DISTINCT "exercicio" AS ano FROM "DisponibilidadeRecursoNovo"
        UNION
        SELECT DISTINCT "ano"       AS ano FROM "LeiCredito"
        UNION
        SELECT DISTINCT "ano"       AS ano FROM "DecretoCredito"
       ) AS anos
 ON CONFLICT ("ano") DO NOTHING;
