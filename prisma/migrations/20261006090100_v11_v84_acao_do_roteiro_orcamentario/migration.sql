-- V11 V8.4 — a ação do cadastro do roteiro orçamentário. Migration própria (ALTER TYPE).
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PARAMETRIZAR_ROTEIRO_ORCAMENTARIO';
