-- V36 (TR 5.10.1.45) — multas de trânsito dos veículos da frota. Aditiva.
-- CreateTable
CREATE TABLE "MultaDeTransito" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "orgaoAutuador" VARCHAR(120) NOT NULL,
    "numeroDoAuto" VARCHAR(30) NOT NULL,
    "dataDaInfracao" TIMESTAMP(3) NOT NULL,
    "dataDaNotificacao" TIMESTAMP(3) NOT NULL,
    "local" TEXT NOT NULL,
    "infracao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "vencimento" TIMESTAMP(3),
    "infratorId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MultaDeTransito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaixaDaMultaDeTransito" (
    "id" TEXT NOT NULL,
    "multaId" TEXT NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "BaixaDaMultaDeTransito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MultaDeTransito_lancamentoId_key" ON "MultaDeTransito"("lancamentoId");

-- CreateIndex
CREATE INDEX "MultaDeTransito_veiculoId_dataDaInfracao_idx" ON "MultaDeTransito"("veiculoId", "dataDaInfracao");

-- CreateIndex
CREATE INDEX "MultaDeTransito_infratorId_idx" ON "MultaDeTransito"("infratorId");

-- CreateIndex
CREATE UNIQUE INDEX "MultaDeTransito_orgaoAutuador_numeroDoAuto_key" ON "MultaDeTransito"("orgaoAutuador", "numeroDoAuto");

-- CreateIndex
CREATE UNIQUE INDEX "BaixaDaMultaDeTransito_multaId_key" ON "BaixaDaMultaDeTransito"("multaId");

-- CreateIndex
CREATE UNIQUE INDEX "BaixaDaMultaDeTransito_lancamentoId_key" ON "BaixaDaMultaDeTransito"("lancamentoId");

-- AddForeignKey
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "VeiculoDaFrota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_infratorId_fkey" FOREIGN KEY ("infratorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaDaMultaDeTransito" ADD CONSTRAINT "BaixaDaMultaDeTransito_multaId_fkey" FOREIGN KEY ("multaId") REFERENCES "MultaDeTransito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs que o Prisma não representa.
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_textos_preenchidos" CHECK (length(btrim("orgaoAutuador")) > 0 AND length(btrim("numeroDoAuto")) > 0 AND length(btrim("local")) > 0 AND length(btrim("infracao")) > 0);
ALTER TABLE "BaixaDaMultaDeTransito" ADD CONSTRAINT "BaixaDaMultaDeTransito_tipo" CHECK ("tipo" IN ('PAGA_PELO_ENTE', 'RESSARCIDA_PELO_INFRATOR', 'CANCELADA_EM_RECURSO', 'REGISTRO_INDEVIDO'));
ALTER TABLE "BaixaDaMultaDeTransito" ADD CONSTRAINT "BaixaDaMultaDeTransito_observacao_preenchida" CHECK (length(btrim("observacao")) > 0);
