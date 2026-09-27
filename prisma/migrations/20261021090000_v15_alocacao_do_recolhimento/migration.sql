-- V15 — QUAL RETENCAO CADA RECOLHIMENTO QUITA (C34)
--
-- Aditiva: uma tabela nova. Zero DROP, nenhuma coluna existente tocada, nenhum enum alterado.
--
-- ⚠️ POR QUE ELA E NECESSARIA. O saldo extraorcamentario e somado por
-- `(tipoConsignacao, credorConsignatario)`, e isso responde "quanto ainda se deve ao INSS" — mas
-- nao responde "de onde veio o que esta guia recolheu" nem permite que estornar um recolhimento
-- devolva ao campo do que falta exatamente as retencoes que ELE quitou. Sem vinculo, o estorno
-- teria de devolver uma fatia proporcional de um agregado, que e uma invencao.
--
-- ⚠️ SEM RESTRICAO DE EXERCICIO, de proposito: o termo de referencia pede vincular a retencoes
-- "atuais ou anteriores". Uma retencao de dezembro se recolhe em janeiro.
--
-- ⚠️ `ON DELETE RESTRICT` nas duas pontas, DECLARADO tambem no schema. A licao e da unidade
-- anterior desta mesma rodada: o Prisma assume `SET NULL` para relacao opcional quando ninguem
-- declara, e estas nao sao opcionais — mas declarar o que o banco faz e o que impede o `deriva` de
-- acusar uma diferenca que nao existe. Aqui as duas colunas sao NOT NULL e `Restrict` e o certo:
-- apagar um movimento que uma alocacao aponta destruiria a composicao.
--
-- ⚠️ O CHECK DO VALOR mora em `prisma/sql/ck_alocacao_recolhimento_positiva.sql`, nao aqui — um
-- dono por objeto, para nao reproduzir a colisao que deixou o `npm run deriva` sem medir.

CREATE TABLE "AlocacaoDoRecolhimento" (
    "id"             TEXT NOT NULL,
    "recolhimentoId" TEXT NOT NULL,
    "ingressoId"     TEXT NOT NULL,
    "valor"          DECIMAL(18,2) NOT NULL,
    "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor"      TEXT NOT NULL,

    CONSTRAINT "AlocacaoDoRecolhimento_pkey" PRIMARY KEY ("id")
);

-- Uma linha por par: duas parcelas do mesmo recolhimento sobre a mesma retencao sao uma parcela
-- so, e somar duas linhas esconderia a duplicidade.
CREATE UNIQUE INDEX "AlocacaoDoRecolhimento_recolhimentoId_ingressoId_key"
    ON "AlocacaoDoRecolhimento"("recolhimentoId", "ingressoId");
CREATE INDEX "AlocacaoDoRecolhimento_ingressoId_idx"
    ON "AlocacaoDoRecolhimento"("ingressoId");

ALTER TABLE "AlocacaoDoRecolhimento" ADD CONSTRAINT "AlocacaoDoRecolhimento_recolhimentoId_fkey"
  FOREIGN KEY ("recolhimentoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlocacaoDoRecolhimento" ADD CONSTRAINT "AlocacaoDoRecolhimento_ingressoId_fkey"
  FOREIGN KEY ("ingressoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
