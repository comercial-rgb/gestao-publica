-- V26 — o subtipo da dedução (§5.23) e a origem de cada linha da receita prevista (SAGRES §4.7/§4.44).
-- Aditiva: uma tabela nova; nenhuma linha da previsão muda.

CREATE TABLE "DetalheDaReceitaPrevista" (
    "id" TEXT NOT NULL,
    "receitaPrevistaId" TEXT NOT NULL,
    "tipoDeducaoSagres" VARCHAR(1),
    "codigoNoDocumento" TEXT,
    "documento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DetalheDaReceitaPrevista_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DetalheDaReceitaPrevista_receitaPrevistaId_key" ON "DetalheDaReceitaPrevista"("receitaPrevistaId");
ALTER TABLE "DetalheDaReceitaPrevista" ADD CONSTRAINT "DetalheDaReceitaPrevista_receitaPrevistaId_fkey" FOREIGN KEY ("receitaPrevistaId") REFERENCES "ReceitaPrevista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DetalheDaReceitaPrevista" ADD CONSTRAINT "DetalheDaReceitaPrevista_deducao_check" CHECK ("tipoDeducaoSagres" IS NULL OR "tipoDeducaoSagres" IN ('3', '4', '5'));
