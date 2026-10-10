-- V26 + V39-R2 (R2-005, M07) — o conjunto FECHADO dos fatos da retenção própria do Tesouro, nas duas tabelas.
--
-- Até a V39 o CHECK vivia só na migration da V26 (o comentário do schema dizia "prisma/sql/"): aqui fica a forma
-- vigente, com o fato do IR de PESSOA FÍSICA (V39-R2). IDEMPOTENTE: o global-setup aplica esta pasta a cada rodada;
-- a restrição é recriada com o conjunto vigente (ampliar não invalida nenhuma linha). Mesmo conteúdo da migration
-- 20261110050000_v39r2_fato_ir_pessoa_fisica.
DO $$
BEGIN
  IF to_regclass('"ClassificacaoDaRetencaoPropria"') IS NOT NULL THEN
    ALTER TABLE "ClassificacaoDaRetencaoPropria" DROP CONSTRAINT IF EXISTS "ClassificacaoDaRetencaoPropria_fato_check";
    ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'IRRF_PESSOA_FISICA', 'ISS'));
  END IF;
  IF to_regclass('"RetencaoPropriaDoPagamento"') IS NOT NULL THEN
    ALTER TABLE "RetencaoPropriaDoPagamento" DROP CONSTRAINT IF EXISTS "RetencaoPropriaDoPagamento_fato_check";
    ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'IRRF_PESSOA_FISICA', 'ISS'));
  END IF;
END $$;
