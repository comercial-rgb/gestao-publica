-- V11 V8.12 — A EXCEÇÃO DE CALENDÁRIO DEIXA DE SÓ FECHAR (`EXCECAO-DE-CALENDARIO-SO-FECHA`)
--
-- Faltavam DUAS coisas, e as duas vinham da mesma escolha de modelo (uma linha única por dia):
--   · o FERIADO COM EXPEDIENTE REDUZIDO — a véspera que abre só de manhã — não tinha como ser dito;
--   · o dia fechado por engano NÃO TINHA VOLTA. Sem UPDATE e sem DELETE para o papel de runtime,
--     e com a unicidade por dia fechando a porta, o erro ficava para sempre.
--
-- Cada decisão sobre o dia passa a ser um FATO com sequência, e a vigente é a de maior sequência.
CREATE TYPE "TipoDaExcecaoDeCalendario" AS ENUM ('FECHADO', 'EXPEDIENTE_ESPECIAL', 'EXPEDIENTE_NORMAL');

ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD COLUMN "tipo" "TipoDaExcecaoDeCalendario" NOT NULL DEFAULT 'FECHADO';
ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD COLUMN "horaInicio" VARCHAR(5);
ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD COLUMN "horaFim" VARCHAR(5);
ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD COLUMN "sequencia" INTEGER NOT NULL DEFAULT 1;

-- ⚠️ ESTE `DROP` É O QUE A MUDANÇA DE MODELO EXIGE, e ele é do MESMO tipo do que a V8.4 fez ao
-- versionar o roteiro: a unicidade por (unidade, dia) é exatamente o que impede a segunda decisão
-- sobre o mesmo dia. Nenhuma linha se perde — toda exceção existente vira a sequência 1, do tipo
-- FECHADO, que é o que ela já significava.
DROP INDEX IF EXISTS "ExcecaoDeCalendarioDoAtendimento_unidadeId_dia_key";
CREATE UNIQUE INDEX "ExcecaoDeCalendarioDoAtendimento_unidadeId_dia_sequencia_key"
    ON "ExcecaoDeCalendarioDoAtendimento"("unidadeId", "dia", "sequencia");
CREATE INDEX "ExcecaoDeCalendarioDoAtendimento_unidadeId_dia_sequencia_idx"
    ON "ExcecaoDeCalendarioDoAtendimento"("unidadeId", "dia", "sequencia");

-- ⚠️ MEIA JANELA É PIOR QUE NENHUMA: ela parece configuração e não oferece horário nenhum. Os
-- dois campos andam juntos, e só no EXPEDIENTE_ESPECIAL.
ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD CONSTRAINT "ck_excecao_horas_so_no_expediente_especial" CHECK (
    ("tipo" = 'EXPEDIENTE_ESPECIAL' AND "horaInicio" IS NOT NULL AND "horaFim" IS NOT NULL AND "horaFim" > "horaInicio")
    OR ("tipo" <> 'EXPEDIENTE_ESPECIAL' AND "horaInicio" IS NULL AND "horaFim" IS NULL)
);

ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD CONSTRAINT "ck_excecao_sequencia_positiva" CHECK ("sequencia" >= 1);
