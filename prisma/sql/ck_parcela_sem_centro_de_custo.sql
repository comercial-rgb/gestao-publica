-- V39-R3 (R3-021, M12) — a parcela da folha sem centro de custo tem valor positivo. IDEMPOTENTE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcela_sem_centro_de_custo') THEN
    ALTER TABLE "ParcelaSemCentroDeCusto" ADD CONSTRAINT "ck_parcela_sem_centro_de_custo" CHECK ("valor" > 0);
  END IF;
END $$;
