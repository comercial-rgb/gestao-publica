-- V11 V5.1 — a configuracao do acesso a informacao. Aditiva: uma tabela. Zero DROP, zero seed.
--
-- ⚠️ SEM SEED, E ISSO E O PONTO. O prazo de resposta a um pedido de acesso a informacao nasce de
-- lei federal e da regulamentacao do municipio. Semear "20 dias" aqui seria este arquivo inventando
-- norma — federal e municipal de uma vez. E o molde ja existe no repositorio:
-- `VersaoDaConfiguracaoDaCertidao` (M34) nasceu vazia pela mesma razao, e o comentario dela diz
-- "90 dias e o prazo de muitos municipios e nao e o de todos".

CREATE TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "vigenciaInicio" VARCHAR(10) NOT NULL,
    "prazoDeRespostaEmDias" INTEGER NOT NULL,
    "prazoDeProrrogacaoEmDias" INTEGER NOT NULL,
    "prorrogacoesPermitidas" INTEGER NOT NULL,
    "instanciasDeRecurso" INTEGER NOT NULL,
    "prazoDeRecursoEmDias" INTEGER NOT NULL,
    "normaFederal" TEXT NOT NULL,
    "normaFederalPublicadaEm" TIMESTAMP(3) NOT NULL,
    "regulamentacaoLocal" TEXT,
    "regulamentacaoLocalPublicadaEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "VersaoDaConfiguracaoDoAcessoAInformacao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_versao_positiva"
  CHECK ("versao" >= 1);
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_vigencia_formato"
  CHECK ("vigenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

-- ⚠️ PRAZO ZERO NAO E PRAZO. Um prazo de resposta de zero dias venceria no instante do protocolo,
-- e a tela mostraria todo pedido ATRASADO desde o primeiro segundo.
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_prazo_resposta_positivo"
  CHECK ("prazoDeRespostaEmDias" >= 1);
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_prazo_prorrogacao_positivo"
  CHECK ("prazoDeProrrogacaoEmDias" >= 1);
-- Zero prorrogacoes e zero instancias sao respostas VALIDAS — ha norma que nao admite nenhuma das
-- duas. O que nao e valido e numero negativo.
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_prorrogacoes_nao_negativas"
  CHECK ("prorrogacoesPermitidas" >= 0);
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_instancias_nao_negativas"
  CHECK ("instanciasDeRecurso" >= 0);
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_prazo_recurso_positivo"
  CHECK ("prazoDeRecursoEmDias" >= 1);

-- ⚠️ NORMA SEM CITACAO NAO E NORMA. O campo existe para quem vai auditar saber CONTRA O QUE
-- conferir o prazo; vazio, ele so ocuparia espaco e daria aparencia de fundamento.
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_norma_federal_citada"
  CHECK (length(btrim("normaFederal")) >= 5);

-- ⚠️ OS DOIS OU NENHUM. Regulamentacao local citada sem a data de publicacao nao e conferivel —
-- e a ausencia COMPLETA e o estado honesto, que vira pendencia tratavel na tela.
ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_regulamentacao_local_completa"
  CHECK (("regulamentacaoLocal" IS NULL AND "regulamentacaoLocalPublicadaEm" IS NULL)
      OR (length(btrim("regulamentacaoLocal")) >= 5 AND "regulamentacaoLocalPublicadaEm" IS NOT NULL));

ALTER TABLE "VersaoDaConfiguracaoDoAcessoAInformacao" ADD CONSTRAINT "ConfigAcesso_criadoPor_nao_vazio"
  CHECK (length(btrim("criadoPor")) > 0);

CREATE UNIQUE INDEX "VersaoDaConfiguracaoDoAcessoAInformacao_versao_key"
  ON "VersaoDaConfiguracaoDoAcessoAInformacao"("versao");
CREATE INDEX "VersaoDaConfiguracaoDoAcessoAInformacao_vigenciaInicio_idx"
  ON "VersaoDaConfiguracaoDoAcessoAInformacao"("vigenciaInicio");
