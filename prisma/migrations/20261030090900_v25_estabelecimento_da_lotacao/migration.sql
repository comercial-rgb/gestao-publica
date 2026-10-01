-- V25 — o estabelecimento (CNPJ completo) de cada lotação, para o FAP por estabelecimento. Aditiva: uma
-- tabela nova; nenhuma lotação muda, e sem registro vale o CNPJ do ente, como antes.

CREATE TABLE "EstabelecimentoDaLotacao" (
    "id" TEXT NOT NULL,
    "lotacaoId" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "EstabelecimentoDaLotacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstabelecimentoDaLotacao_lotacaoId_competenciaInicio_key" ON "EstabelecimentoDaLotacao"("lotacaoId", "competenciaInicio");
CREATE INDEX "EstabelecimentoDaLotacao_cnpj_idx" ON "EstabelecimentoDaLotacao"("cnpj");
ALTER TABLE "EstabelecimentoDaLotacao" ADD CONSTRAINT "EstabelecimentoDaLotacao_lotacaoId_fkey" FOREIGN KEY ("lotacaoId") REFERENCES "Lotacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EstabelecimentoDaLotacao" ADD CONSTRAINT "EstabelecimentoDaLotacao_cnpj_check" CHECK ("cnpj" ~ '^[0-9]{14}$');
ALTER TABLE "EstabelecimentoDaLotacao" ADD CONSTRAINT "EstabelecimentoDaLotacao_competencia_check" CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "EstabelecimentoDaLotacao" ADD CONSTRAINT "EstabelecimentoDaLotacao_fundamento_check" CHECK (length(btrim("fundamento")) >= 10);
