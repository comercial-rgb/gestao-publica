-- V39-R2 (R2-005, V39-028, M07) — O IR RETIDO DE FORNECEDOR PESSOA FÍSICA ganha fato próprio: 'IRRF_PESSOA_FISICA'.
-- AMPLIA o conjunto dos dois CHECKs da V26 (mesmo padrão da 20260913090000_v4_cnpj_alfanumerico_nos_checks): o
-- DROP é da RESTRIÇÃO, para recriá-la com um conjunto maior; nenhuma linha e nenhuma coluna é apagada, e todo valor
-- aceito antes continua aceito. Os registros antigos ficam como estão (não se reclassifica pelo documento de hoje).
-- O mesmo de prisma/sql/ck_fato_da_retencao_propria.sql.
ALTER TABLE "ClassificacaoDaRetencaoPropria" DROP CONSTRAINT IF EXISTS "ClassificacaoDaRetencaoPropria_fato_check";
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'IRRF_PESSOA_FISICA', 'ISS'));
ALTER TABLE "RetencaoPropriaDoPagamento" DROP CONSTRAINT IF EXISTS "RetencaoPropriaDoPagamento_fato_check";
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'IRRF_PESSOA_FISICA', 'ISS'));
