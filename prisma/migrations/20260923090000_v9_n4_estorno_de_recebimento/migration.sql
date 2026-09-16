-- V9 N4 — o estorno do recebimento definitivo. Aditiva: uma tabela, zero DROP, zero backfill.
--
-- ⚠️ O `@unique` em "recebimentoId" É A IDEMPOTÊNCIA. Um recebimento se estorna uma vez; sem ele,
-- duas requisições concorrentes gravariam dois estornos do mesmo ato e a quantidade voltaria a ser
-- elegível "duas vezes" para quem contasse os registros em vez da existência.
CREATE TABLE "EstornoDeRecebimentoDefinitivo" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EstornoDeRecebimentoDefinitivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstornoDeRecebimentoDefinitivo_recebimentoId_key" ON "EstornoDeRecebimentoDefinitivo"("recebimentoId");

ALTER TABLE "EstornoDeRecebimentoDefinitivo" ADD CONSTRAINT "EstornoDeRecebimentoDefinitivo_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "RecebimentoDefinitivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstornoDeRecebimentoDefinitivo" ADD CONSTRAINT "EstornoDeRecebimentoDefinitivo_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
