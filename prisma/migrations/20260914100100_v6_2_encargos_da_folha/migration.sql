-- V6.2 — os encargos do empregador sobre a folha (PATRONAL-NA-MEMORIA; TR 5.12.72/73).
-- DDL gerada por `prisma migrate diff`; os CHECKs ao final são deste repositório.
-- Aditiva: zero DROP, zero ALTER de coluna existente. Os valores de enum estão na migration anterior.
-- CreateEnum
CREATE TYPE "TipoDeEncargoDaFolha" AS ENUM ('PREVIDENCIA_PATRONAL', 'PREVIDENCIA_SUPLEMENTAR', 'RISCO_AMBIENTAL_DO_TRABALHO', 'OUTRAS_ENTIDADES', 'FGTS', 'OUTRO');

-- CreateTable
CREATE TABLE "ComponenteDeEncargo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoDeEncargoDaFolha" NOT NULL,
    "regime" "RegimePrevidenciario" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ComponenteDeEncargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoEncargo" (
    "id" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "aliquota" DECIMAL(7,4) NOT NULL,
    "teto" DECIMAL(18,2),
    "fundamentacaoLegal" TEXT NOT NULL,
    "sintetica" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoEncargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidenciaDoEncargo" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,

    CONSTRAINT "IncidenciaDoEncargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoDoEncargo" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AprovacaoDoEncargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApuracaoDeEncargos" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "complementar" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "memoria" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "completa" BOOLEAN NOT NULL,
    "esperados" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ApuracaoDeEncargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificacaoDosEncargos" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "tipo" "TipoDeCertificacao" NOT NULL,
    "motivo" TEXT,
    "sha256" VARCHAR(64) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CertificacaoDosEncargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponenteDoGrupoDeEmpenho" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ComponenteDoGrupoDeEmpenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpenhoDosEncargos" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EmpenhoDosEncargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacaoDosEncargos" (
    "id" TEXT NOT NULL,
    "empenhoDosEncargosId" TEXT NOT NULL,
    "certificacaoId" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LiquidacaoDosEncargos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComponenteDeEncargo_codigo_key" ON "ComponenteDeEncargo"("codigo");

-- CreateIndex
CREATE INDEX "VersaoDoEncargo_componenteId_competenciaInicio_idx" ON "VersaoDoEncargo"("componenteId", "competenciaInicio");

-- CreateIndex
CREATE INDEX "IncidenciaDoEncargo_rubricaId_idx" ON "IncidenciaDoEncargo"("rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidenciaDoEncargo_versaoId_rubricaId_key" ON "IncidenciaDoEncargo"("versaoId", "rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "AprovacaoDoEncargo_versaoId_key" ON "AprovacaoDoEncargo"("versaoId");

-- CreateIndex
CREATE INDEX "ApuracaoDeEncargos_folhaId_idx" ON "ApuracaoDeEncargos"("folhaId");

-- CreateIndex
CREATE UNIQUE INDEX "ApuracaoDeEncargos_calculoId_numero_key" ON "ApuracaoDeEncargos"("calculoId", "numero");

-- CreateIndex
CREATE INDEX "CertificacaoDosEncargos_apuracaoId_criadoEm_idx" ON "CertificacaoDosEncargos"("apuracaoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ComponenteDoGrupoDeEmpenho_componenteId_key" ON "ComponenteDoGrupoDeEmpenho"("componenteId");

-- CreateIndex
CREATE INDEX "ComponenteDoGrupoDeEmpenho_grupoId_idx" ON "ComponenteDoGrupoDeEmpenho"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpenhoDosEncargos_empenhoId_key" ON "EmpenhoDosEncargos"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpenhoDosEncargos_apuracaoId_grupoId_key" ON "EmpenhoDosEncargos"("apuracaoId", "grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacaoDosEncargos_empenhoDosEncargosId_key" ON "LiquidacaoDosEncargos"("empenhoDosEncargosId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacaoDosEncargos_liquidacaoId_key" ON "LiquidacaoDosEncargos"("liquidacaoId");

-- CreateIndex
CREATE INDEX "LiquidacaoDosEncargos_certificacaoId_idx" ON "LiquidacaoDosEncargos"("certificacaoId");

-- AddForeignKey
ALTER TABLE "VersaoDoEncargo" ADD CONSTRAINT "VersaoDoEncargo_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "ComponenteDeEncargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaDoEncargo" ADD CONSTRAINT "IncidenciaDoEncargo_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoEncargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaDoEncargo" ADD CONSTRAINT "IncidenciaDoEncargo_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoDoEncargo" ADD CONSTRAINT "AprovacaoDoEncargo_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoEncargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuracaoDeEncargos" ADD CONSTRAINT "ApuracaoDeEncargos_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuracaoDeEncargos" ADD CONSTRAINT "ApuracaoDeEncargos_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoDosEncargos" ADD CONSTRAINT "CertificacaoDosEncargos_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ApuracaoDeEncargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoDosEncargos" ADD CONSTRAINT "CertificacaoDosEncargos_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponenteDoGrupoDeEmpenho" ADD CONSTRAINT "ComponenteDoGrupoDeEmpenho_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponenteDoGrupoDeEmpenho" ADD CONSTRAINT "ComponenteDoGrupoDeEmpenho_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "ComponenteDeEncargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpenhoDosEncargos" ADD CONSTRAINT "EmpenhoDosEncargos_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ApuracaoDeEncargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpenhoDosEncargos" ADD CONSTRAINT "EmpenhoDosEncargos_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpenhoDosEncargos" ADD CONSTRAINT "EmpenhoDosEncargos_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDosEncargos" ADD CONSTRAINT "LiquidacaoDosEncargos_empenhoDosEncargosId_fkey" FOREIGN KEY ("empenhoDosEncargosId") REFERENCES "EmpenhoDosEncargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDosEncargos" ADD CONSTRAINT "LiquidacaoDosEncargos_certificacaoId_fkey" FOREIGN KEY ("certificacaoId") REFERENCES "CertificacaoDosEncargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDosEncargos" ADD CONSTRAINT "LiquidacaoDosEncargos_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ CHECKs do repositório ═══
-- Alíquota em [0, 1] e teto positivo: um percentual digitado como 20 em vez de 0,20 multiplicaria a folha por 20.
ALTER TABLE "VersaoDoEncargo" ADD CONSTRAINT "ck_versao_do_encargo_aliquota"
  CHECK ("aliquota" >= 0 AND "aliquota" <= 1);
ALTER TABLE "VersaoDoEncargo" ADD CONSTRAINT "ck_versao_do_encargo_teto"
  CHECK ("teto" IS NULL OR "teto" > 0);
-- Competência AAAA-MM e fim não anterior ao início.
ALTER TABLE "VersaoDoEncargo" ADD CONSTRAINT "ck_versao_do_encargo_competencias"
  CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("competenciaFim" IS NULL OR ("competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "competenciaFim" >= "competenciaInicio")));
ALTER TABLE "VersaoDoEncargo" ADD CONSTRAINT "ck_versao_do_encargo_fundamento"
  CHECK (length(btrim("fundamentacaoLegal")) >= 5);
-- A apuração é numerada a partir de 1 e o total não é negativo.
ALTER TABLE "ApuracaoDeEncargos" ADD CONSTRAINT "ck_apuracao_de_encargos_numero"
  CHECK ("numero" >= 1 AND "total" >= 0 AND "esperados" >= 0);
-- Devolver o atesto dos encargos exige motivo.
ALTER TABLE "CertificacaoDosEncargos" ADD CONSTRAINT "ck_certificacao_dos_encargos_devolucao"
  CHECK ("tipo" <> 'DEVOLUCAO' OR ("motivo" IS NOT NULL AND length(btrim("motivo")) >= 3));
-- Empenho e liquidação dos encargos: valor positivo.
ALTER TABLE "EmpenhoDosEncargos" ADD CONSTRAINT "ck_empenho_dos_encargos_valor" CHECK ("valor" > 0);
ALTER TABLE "LiquidacaoDosEncargos" ADD CONSTRAINT "ck_liquidacao_dos_encargos_valor" CHECK ("valor" > 0);
