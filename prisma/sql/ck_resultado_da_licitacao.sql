-- V39-R2 (M11) — os conjuntos fechados e as coerencias do resultado da licitacao: proposta (versao, valor, abrangencia,
-- motivo da versao 2 em diante), criterio de julgamento (Lei 14.133/2021, art. 33), item do resultado (o vencedor com
-- participante, proposta e valor; fracassado e deserto sem), correcao de homologacao com motivo, quantidades positivas
-- e vigencia da ata. IDEMPOTENTE (o global-setup aplica esta pasta a cada rodada). Mesmos CHECKs da migration
-- 20261110080000_v39r2_resultado_da_licitacao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_proposta_do_participante') THEN
    ALTER TABLE "PropostaDoParticipante" ADD CONSTRAINT "ck_proposta_do_participante" CHECK ("versao" >= 1 AND "valorUnitario" > 0 AND "abrangencia" IN ('ITEM', 'LOTE') AND ("versao" = 1 OR "motivo" IS NOT NULL));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_resultado_criterio') THEN
    ALTER TABLE "ResultadoDoProcesso" ADD CONSTRAINT "ck_resultado_criterio" CHECK ("criterio" IN ('MENOR_PRECO', 'MAIOR_DESCONTO', 'MELHOR_TECNICA', 'TECNICA_E_PRECO', 'MAIOR_LANCE', 'MAIOR_RETORNO_ECONOMICO'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_do_resultado') THEN
    ALTER TABLE "ItemDoResultado" ADD CONSTRAINT "ck_item_do_resultado" CHECK (("situacao" = 'VENCEDOR' AND "participanteId" IS NOT NULL AND "propostaId" IS NOT NULL AND "valorUnitario" > 0) OR ("situacao" IN ('FRACASSADO', 'DESERTO') AND "participanteId" IS NULL AND "propostaId" IS NULL AND "valorUnitario" IS NULL));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ato_de_homologacao') THEN
    ALTER TABLE "AtoDeHomologacao" ADD CONSTRAINT "ck_ato_de_homologacao" CHECK (("corrigeId" IS NULL) OR ("motivo" IS NOT NULL));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_do_processo') THEN
    ALTER TABLE "ItemDoProcesso" ADD CONSTRAINT "ck_item_do_processo" CHECK ("quantidade" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_contratado_do_resultado') THEN
    ALTER TABLE "ItemContratadoDoResultado" ADD CONSTRAINT "ck_item_contratado_do_resultado" CHECK ("quantidade" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_item_da_ata') THEN
    ALTER TABLE "ItemDaAta" ADD CONSTRAINT "ck_item_da_ata" CHECK ("quantidade" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ata_vigencia') THEN
    ALTER TABLE "AtaDeRegistroDePrecos" ADD CONSTRAINT "ck_ata_vigencia" CHECK ("vigenciaFim" > "vigenciaInicio");
  END IF;
END $$;
