-- V19/C05 — as DUAS acoes do custo por centro.
--
-- Migration PROPRIA, e nao junto das tabelas: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma
-- transacao em que o tipo e alterado, e o Prisma roda cada migration numa transacao. Licao da V15,
-- pratica desde a V16.
--
-- ⚠️ DUAS, E A SEPARACAO E A QUE O ENTE FAZ. Publicar o critério de rateio e decisao administrativa
-- (dizer que a sede se divide 60/40 entre duas secretarias, por ato); apropriar o custo de uma
-- liquidacao e rotina de quem fecha o mes. Juntar as duas daria a quem lanca o poder de mudar a
-- regua — e um relatorio de custos com a regua trocada no meio do exercicio nao se compara com o do
-- exercicio anterior.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'PARAMETRIZAR_RATEIO_DE_CUSTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'APROPRIAR_CUSTO';
