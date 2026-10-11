-- V39-R2 (R2-025 a 028, M36) — a operacao da frota: exatamente um bem (veiculo ou maquina) em cada registro, categoria
-- da CNH no formato da habilitacao, quantidades e valores positivos, prazo da ordem coerente e correcao de leitura com
-- motivo. IDEMPOTENTE (o global-setup aplica esta pasta a cada rodada). Mesmos CHECKs da migration
-- 20261110140000_v39r2_operacao_da_frota.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_versao_do_condutor') THEN
    ALTER TABLE "VersaoDoCondutor" ADD CONSTRAINT "ck_versao_do_condutor" CHECK ("versao" >= 1 AND "cnhCategoria" ~ '^(A|B|C|D|E|AB|AC|AD|AE)$');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_exigencia_de_habilitacao_um_bem') THEN
    ALTER TABLE "ExigenciaDeHabilitacaoDaFrota" ADD CONSTRAINT "ck_exigencia_de_habilitacao_um_bem" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND cardinality("categoriasAceitas") >= 1);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ordem_de_abastecimento') THEN
    ALTER TABLE "OrdemDeAbastecimento" ADD CONSTRAINT "ck_ordem_de_abastecimento" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND "quantidadeAutorizada" > 0 AND "validaAte" >= "emitidaEm");
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_leitura_do_marcador') THEN
    ALTER TABLE "LeituraDoMarcadorDaFrota" ADD CONSTRAINT "ck_leitura_do_marcador" CHECK ((("veiculoId" IS NULL) <> ("maquinaId" IS NULL)) AND "valor" >= 0 AND ("corrigeId" IS NULL OR ("motivo" IS NOT NULL AND length(btrim("motivo")) > 0)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_manutencao_da_frota_um_bem') THEN
    ALTER TABLE "ManutencaoDaFrota" ADD CONSTRAINT "ck_manutencao_da_frota_um_bem" CHECK (("veiculoId" IS NULL) <> ("maquinaId" IS NULL));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_valores_da_manutencao') THEN
    ALTER TABLE "AutorizacaoDaManutencaoDaFrota" ADD CONSTRAINT "ck_valores_da_manutencao" CHECK ("valorEstimado" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_custo_da_manutencao') THEN
    ALTER TABLE "ConclusaoDaManutencaoDaFrota" ADD CONSTRAINT "ck_custo_da_manutencao" CHECK ("custo" >= 0);
  END IF;
END $$;
