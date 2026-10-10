-- V39-R2 (R2-008 a 013, V39-032, M11) — O CONTROLE CONTÁBIL DO CONTRATO: o elo entre o fato do contrato e o lançamento
-- de controle que o roteiro CONTRATO produziu, com a versão do roteiro. Aditiva: uma tabela nova; o UNIQUE (evento,
-- origem) é a idempotência. O CHECK do evento é o mesmo de prisma/sql/ck_controle_contabil_do_contrato.sql.
CREATE TABLE "LancamentoDeControleDoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "evento" VARCHAR(20) NOT NULL,
    "origemId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "versaoDoRoteiro" INTEGER,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "LancamentoDeControleDoContrato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LancamentoDeControleDoContrato_lancamentoId_key" ON "LancamentoDeControleDoContrato"("lancamentoId");
CREATE INDEX "LancamentoDeControleDoContrato_estornoDeId_idx" ON "LancamentoDeControleDoContrato"("estornoDeId");
CREATE UNIQUE INDEX "LancamentoDeControleDoContrato_evento_origemId_key" ON "LancamentoDeControleDoContrato"("evento", "origemId");
CREATE INDEX "LancamentoDeControleDoContrato_contratoId_idx" ON "LancamentoDeControleDoContrato"("contratoId");
ALTER TABLE "LancamentoDeControleDoContrato" ADD CONSTRAINT "LancamentoDeControleDoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LancamentoDeControleDoContrato" ADD CONSTRAINT "LancamentoDeControleDoContrato_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LancamentoDeControleDoContrato" ADD CONSTRAINT "LancamentoDeControleDoContrato_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "LancamentoDeControleDoContrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LancamentoDeControleDoContrato" ADD CONSTRAINT "ck_controle_contabil_do_contrato" CHECK (
  "evento" IN ('REGISTRO', 'ACRESCIMO', 'SUPRESSAO', 'EXECUCAO', 'ESTORNO') AND "valor" > 0
  AND (("evento" = 'ESTORNO') = ("estornoDeId" IS NOT NULL))
);
