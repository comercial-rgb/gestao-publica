-- V39-R3 (R3-018, M36) — o tanque de combustivel tem capacidade positiva; o abastecimento interno tem o tanque E a saida
-- fisica (os dois ou nenhum: o externo nao tem nenhum). IDEMPOTENTE. Mesmos CHECKs da migration 20261111090500.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tanque_de_combustivel') THEN
    ALTER TABLE "TanqueDeCombustivel" ADD CONSTRAINT "ck_tanque_de_combustivel" CHECK ("capacidade" > 0 AND length(btrim("fundamento")) > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_abastecimento_do_tanque') THEN
    ALTER TABLE "AbastecimentoDaFrota" ADD CONSTRAINT "ck_abastecimento_do_tanque" CHECK (("tanqueId" IS NULL) = ("movimentoFisicoId" IS NULL));
  END IF;
END $$;
