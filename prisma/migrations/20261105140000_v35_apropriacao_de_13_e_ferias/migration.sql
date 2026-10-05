-- V35 — apropriação mensal do 13º e das férias (MCASP 11ª ed., Parte II, item 18). Aditiva.
CREATE TYPE "TipoDaApropriacaoDePessoal" AS ENUM ('DECIMO_TERCEIRO', 'FERIAS');

CREATE TABLE "ParametroDaApropriacaoDeFerias" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "mesesDoPeriodoAquisitivo" INTEGER NOT NULL,
    "abonoNumerador" INTEGER NOT NULL,
    "abonoDenominador" INTEGER NOT NULL,
    "incluiRemuneracaoDoPeriodo" BOOLEAN NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ParametroDaApropriacaoDeFerias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApropriacaoPorCompetencia" (
    "id" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "tipo" "TipoDaApropriacaoDePessoal" NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "parametroDoDecimoTerceiroId" TEXT NOT NULL,
    "parametroDeFeriasId" TEXT,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ApropriacaoPorCompetencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemDaApropriacaoPorCompetencia" (
    "id" TEXT NOT NULL,
    "apropriacaoId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemDaApropriacaoPorCompetencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcertoDoDecimoTerceiro" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "saldoAntes" DECIMAL(18,2) NOT NULL,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AcertoDoDecimoTerceiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParametroDaApropriacaoDeFerias_exercicio_versao_key" ON "ParametroDaApropriacaoDeFerias"("exercicio", "versao");

CREATE UNIQUE INDEX "ApropriacaoPorCompetencia_lancamentoId_key" ON "ApropriacaoPorCompetencia"("lancamentoId");

CREATE INDEX "ApropriacaoPorCompetencia_exercicio_tipo_idx" ON "ApropriacaoPorCompetencia"("exercicio", "tipo");

CREATE UNIQUE INDEX "ApropriacaoPorCompetencia_competencia_tipo_key" ON "ApropriacaoPorCompetencia"("competencia", "tipo");

CREATE INDEX "ItemDaApropriacaoPorCompetencia_vinculoId_idx" ON "ItemDaApropriacaoPorCompetencia"("vinculoId");

CREATE UNIQUE INDEX "ItemDaApropriacaoPorCompetencia_apropriacaoId_vinculoId_key" ON "ItemDaApropriacaoPorCompetencia"("apropriacaoId", "vinculoId");

CREATE UNIQUE INDEX "AcertoDoDecimoTerceiro_exercicio_key" ON "AcertoDoDecimoTerceiro"("exercicio");

CREATE UNIQUE INDEX "AcertoDoDecimoTerceiro_lancamentoId_key" ON "AcertoDoDecimoTerceiro"("lancamentoId");

ALTER TABLE "ApropriacaoPorCompetencia" ADD CONSTRAINT "ApropriacaoPorCompetencia_parametroDeFeriasId_fkey" FOREIGN KEY ("parametroDeFeriasId") REFERENCES "ParametroDaApropriacaoDeFerias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApropriacaoPorCompetencia" ADD CONSTRAINT "ApropriacaoPorCompetencia_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ItemDaApropriacaoPorCompetencia" ADD CONSTRAINT "ItemDaApropriacaoPorCompetencia_apropriacaoId_fkey" FOREIGN KEY ("apropriacaoId") REFERENCES "ApropriacaoPorCompetencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ItemDaApropriacaoPorCompetencia" ADD CONSTRAINT "ItemDaApropriacaoPorCompetencia_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcertoDoDecimoTerceiro" ADD CONSTRAINT "AcertoDoDecimoTerceiro_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
