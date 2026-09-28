-- V22 — as duas ações da solicitação de empenho.
--
-- Migration PRÓPRIA, sem tabela nenhuma: `ALTER TYPE ... ADD VALUE` fica sozinho desde a V15.
--
-- ⚠️ SÃO DUAS, E A SEPARAÇÃO É O PONTO. Solicitar é pedir a despesa; autorizar é consentir com
-- ela. Uma ação única juntaria de volta o que o termo de referência pede para separar — e a
-- regra "quem solicita não autoriza a própria solicitação" é cobrada no caso de uso mesmo
-- quando o ente dá as duas à mesma pessoa.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'SOLICITAR_EMPENHO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'AUTORIZAR_SOLICITACAO_DE_EMPENHO';
