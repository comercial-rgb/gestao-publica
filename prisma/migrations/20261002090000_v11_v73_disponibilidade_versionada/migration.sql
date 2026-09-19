-- V11 V7.3 — A DECLARAÇÃO DE DISPONIBILIDADE DE RECURSO NOVO PASSA A SER VERSIONADA.
--
-- ═══ O QUE ESTAVA ERRADO ═══
-- Havia UMA linha por (exercício, fonte, origem). Redeclarar a apuração significava TROCAR o
-- `valor` dela — e com isso reescrever, em silêncio, o número contra o qual os decretos já
-- aprovados foram autorizados. Um decreto emitido contra "superávit de 100.000" passava a
-- constar emitido contra "superávit de 40.000", e a prestação de contas não teria como mostrar
-- o que a autorização enxergava no dia. É a mesma lição que fez a configuração do acesso à
-- informação nascer versionada: alterar parâmetro não pode reescrever histórico.
--
-- ═══ ⚠️ O `DROP` É DE ÍNDICE, E A NOVA RESTRIÇÃO É MAIS LARGA ═══
-- `DisponibilidadeRecursoNovo_exercicio_fonteId_origem_key` proibia a segunda versão — é
-- exatamente a restrição que precisa sair para a correção existir. Nenhuma linha é apagada e
-- nenhuma coluna some.
--
-- ⚠️ E A MIGRAÇÃO DOS DADOS É O DEFAULT: toda linha existente vira `versao = 1`, que é o que
-- ela sempre foi — a primeira e única declaração daquela fonte. A leitura passa a pedir a MAIOR
-- versão, e sobre um banco de linhas versão 1 ela devolve exatamente o que o `findUnique`
-- devolvia. Não há janela em que a vigente mude de valor por causa desta migration.

ALTER TABLE "DisponibilidadeRecursoNovo" ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "DisponibilidadeRecursoNovo_exercicio_fonteId_origem_key";

CREATE UNIQUE INDEX "DisponibilidadeRecursoNovo_exercicio_fonteId_origem_versao_key"
  ON "DisponibilidadeRecursoNovo" ("exercicio", "fonteId", "origem", "versao");

CREATE INDEX "DisponibilidadeRecursoNovo_exercicio_fonteId_origem_versao_idx"
  ON "DisponibilidadeRecursoNovo" ("exercicio", "fonteId", "origem", "versao");

-- ⚠️ VERSÃO COMEÇA EM 1 E CRESCE. Zero ou negativo não é "primeira declaração": é uma linha que
-- a leitura da VIGENTE ordenaria à frente de uma declaração real, e o decreto passaria a ser
-- conferido contra um número que ninguém declarou por último.
ALTER TABLE "DisponibilidadeRecursoNovo"
  ADD CONSTRAINT "ck_disponibilidade_versao_positiva" CHECK ("versao" >= 1);

-- O valor declarado é POSITIVO. Uma disponibilidade zero ou negativa não autoriza nada, e
-- declará-la é dizer "não há recurso" — o que se registra não declarando, ou declarando o que
-- de fato sobrou. Um número negativo aqui viraria `restante` negativo no guard e a mensagem de
-- recusa passaria a citar um saldo impossível.
ALTER TABLE "DisponibilidadeRecursoNovo"
  ADD CONSTRAINT "ck_disponibilidade_valor_positivo" CHECK ("valor" > 0);
