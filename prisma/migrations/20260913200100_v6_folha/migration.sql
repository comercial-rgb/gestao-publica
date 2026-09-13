-- V6 P2.3 — M33 FOLHA DE PAGAMENTO: tabelas do ente (contribuição, IRRF, salário-família), rubricas,
-- lançamentos, folha, cálculo numerado, cancelamento e fechamento como fatos, contracheque com memória e sha256.
-- DDL gerada por `prisma migrate diff` sobre o schema local; os CHECKs abaixo são deste repositório.

-- CreateEnum
CREATE TYPE "RegimePrevidenciario" AS ENUM ('RGPS', 'RPPS', 'ISENTO');

-- CreateEnum
CREATE TYPE "TipoDeRubrica" AS ENUM ('PROVENTO', 'DESCONTO');

-- CreateEnum
CREATE TYPE "NaturezaDaRubrica" AS ENUM ('VENCIMENTO_BASE', 'GRATIFICACOES_DO_VINCULO', 'VALOR_INFORMADO', 'PERCENTUAL_DO_VENCIMENTO', 'CONTRIBUICAO_PREVIDENCIARIA', 'IMPOSTO_DE_RENDA', 'SALARIO_FAMILIA');

-- CreateEnum
CREATE TYPE "TipoDeLancamentoDaFolha" AS ENUM ('FIXO', 'VARIAVEL');

-- CreateEnum
CREATE TYPE "TipoDeFolha" AS ENUM ('MENSAL');

-- AlterTable
ALTER TABLE "Vinculo" ADD COLUMN     "regimePrevidenciario" "RegimePrevidenciario";

-- CreateTable
CREATE TABLE "TabelaDeContribuicao" (
    "id" TEXT NOT NULL,
    "regime" "RegimePrevidenciario" NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "teto" DECIMAL(18,2),
    "aliquotaPatronal" DECIMAL(7,4),
    "fundamentacaoLegal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TabelaDeContribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaixaDeContribuicao" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ate" DECIMAL(18,2),
    "aliquota" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "FaixaDeContribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaIrrf" (
    "id" TEXT NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "deducaoPorDependente" DECIMAL(18,2) NOT NULL,
    "descontoSimplificado" DECIMAL(18,2),
    "isencaoMaior65" DECIMAL(18,2),
    "redutorBase" DECIMAL(18,2),
    "redutorFator" DECIMAL(12,8),
    "redutorRendaMaxima" DECIMAL(18,2),
    "fundamentacaoLegal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TabelaIrrf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaixaIrrf" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ate" DECIMAL(18,2),
    "aliquota" DECIMAL(7,4) NOT NULL,
    "parcelaADeduzir" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "FaixaIrrf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaSalarioFamilia" (
    "id" TEXT NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "rendaMaxima" DECIMAL(18,2) NOT NULL,
    "valorPorDependente" DECIMAL(18,2) NOT NULL,
    "idadeLimite" INTEGER NOT NULL,
    "fundamentacaoLegal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TabelaSalarioFamilia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubrica" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoDeRubrica" NOT NULL,
    "natureza" "NaturezaDaRubrica" NOT NULL,
    "percentual" DECIMAL(7,4),
    "incideContribuicao" BOOLEAN NOT NULL,
    "incideIrrf" BOOLEAN NOT NULL,
    "proporcionalAosDias" BOOLEAN NOT NULL,
    "ordem" INTEGER NOT NULL,
    "fundamentacaoLegal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Rubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoDaFolha" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "tipo" "TipoDeLancamentoDaFolha" NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "valor" DECIMAL(18,2) NOT NULL,
    "observacao" TEXT,
    "atoLegal" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LancamentoDaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolhaDePagamento" (
    "id" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "tipo" "TipoDeFolha" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FolhaDePagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculoDaFolha" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "motivo" TEXT,
    "totalProventos" DECIMAL(18,2) NOT NULL,
    "totalDescontos" DECIMAL(18,2) NOT NULL,
    "totalLiquido" DECIMAL(18,2) NOT NULL,
    "contracheques" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "versaoDoMotor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CalculoDaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDoCalculo" (
    "id" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CancelamentoDoCalculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoDaFolha" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FechamentoDaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contracheque" (
    "id" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "regime" "RegimePrevidenciario" NOT NULL,
    "diasComputados" INTEGER NOT NULL,
    "totalProventos" DECIMAL(18,2) NOT NULL,
    "totalDescontos" DECIMAL(18,2) NOT NULL,
    "liquido" DECIMAL(18,2) NOT NULL,
    "baseContribuicao" DECIMAL(18,2) NOT NULL,
    "contribuicao" DECIMAL(18,2) NOT NULL,
    "baseIrrf" DECIMAL(18,2) NOT NULL,
    "irrf" DECIMAL(18,2) NOT NULL,
    "memoria" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,

    CONSTRAINT "Contracheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaDoContracheque" (
    "id" TEXT NOT NULL,
    "contrachequeId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" "TipoDeRubrica" NOT NULL,
    "valorBase" DECIMAL(18,2) NOT NULL,
    "fator" DECIMAL(10,6) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "incideContribuicao" BOOLEAN NOT NULL,
    "incideIrrf" BOOLEAN NOT NULL,
    "memoria" TEXT NOT NULL,

    CONSTRAINT "LinhaDoContracheque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TabelaDeContribuicao_regime_competenciaInicio_idx" ON "TabelaDeContribuicao"("regime", "competenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "FaixaDeContribuicao_tabelaId_ordem_key" ON "FaixaDeContribuicao"("tabelaId", "ordem");

-- CreateIndex
CREATE INDEX "TabelaIrrf_competenciaInicio_idx" ON "TabelaIrrf"("competenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "FaixaIrrf_tabelaId_ordem_key" ON "FaixaIrrf"("tabelaId", "ordem");

-- CreateIndex
CREATE INDEX "TabelaSalarioFamilia_competenciaInicio_idx" ON "TabelaSalarioFamilia"("competenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Rubrica_codigo_key" ON "Rubrica"("codigo");

-- CreateIndex
CREATE INDEX "Rubrica_natureza_idx" ON "Rubrica"("natureza");

-- CreateIndex
CREATE INDEX "Rubrica_ordem_idx" ON "Rubrica"("ordem");

-- CreateIndex
CREATE INDEX "LancamentoDaFolha_vinculoId_competenciaInicio_idx" ON "LancamentoDaFolha"("vinculoId", "competenciaInicio");

-- CreateIndex
CREATE INDEX "LancamentoDaFolha_rubricaId_idx" ON "LancamentoDaFolha"("rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "FolhaDePagamento_competencia_tipo_key" ON "FolhaDePagamento"("competencia", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CalculoDaFolha_folhaId_numero_key" ON "CalculoDaFolha"("folhaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDoCalculo_calculoId_key" ON "CancelamentoDoCalculo"("calculoId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoDaFolha_folhaId_key" ON "FechamentoDaFolha"("folhaId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoDaFolha_calculoId_key" ON "FechamentoDaFolha"("calculoId");

-- CreateIndex
CREATE INDEX "Contracheque_vinculoId_idx" ON "Contracheque"("vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "Contracheque_calculoId_vinculoId_key" ON "Contracheque"("calculoId", "vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaDoContracheque_contrachequeId_rubricaId_key" ON "LinhaDoContracheque"("contrachequeId", "rubricaId");

-- AddForeignKey
ALTER TABLE "FaixaDeContribuicao" ADD CONSTRAINT "FaixaDeContribuicao_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "TabelaDeContribuicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaixaIrrf" ADD CONSTRAINT "FaixaIrrf_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "TabelaIrrf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoDaFolha" ADD CONSTRAINT "LancamentoDaFolha_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoDaFolha" ADD CONSTRAINT "LancamentoDaFolha_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculoDaFolha" ADD CONSTRAINT "CalculoDaFolha_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDoCalculo" ADD CONSTRAINT "CancelamentoDoCalculo_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoDaFolha" ADD CONSTRAINT "FechamentoDaFolha_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoDaFolha" ADD CONSTRAINT "FechamentoDaFolha_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contracheque" ADD CONSTRAINT "Contracheque_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contracheque" ADD CONSTRAINT "Contracheque_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDoContracheque" ADD CONSTRAINT "LinhaDoContracheque_contrachequeId_fkey" FOREIGN KEY ("contrachequeId") REFERENCES "Contracheque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDoContracheque" ADD CONSTRAINT "LinhaDoContracheque_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══ CHECKs (o Prisma não representa) ═══
-- Vigência por competência AAAA-MM, e fim nunca antes do início.
ALTER TABLE "TabelaDeContribuicao" ADD CONSTRAINT "TabelaDeContribuicao_competencia_chk" CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("competenciaFim" IS NULL OR ("competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "competenciaFim" >= "competenciaInicio")));
ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_competencia_chk" CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("competenciaFim" IS NULL OR ("competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "competenciaFim" >= "competenciaInicio")));
ALTER TABLE "TabelaSalarioFamilia" ADD CONSTRAINT "TabelaSalarioFamilia_competencia_chk" CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("competenciaFim" IS NULL OR ("competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "competenciaFim" >= "competenciaInicio")));
ALTER TABLE "LancamentoDaFolha" ADD CONSTRAINT "LancamentoDaFolha_competencia_chk" CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("competenciaFim" IS NULL OR ("competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "competenciaFim" >= "competenciaInicio")));
ALTER TABLE "FolhaDePagamento" ADD CONSTRAINT "FolhaDePagamento_competencia_chk" CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
-- Variável vale numa competência só; fixo tem início (e fim opcional).
ALTER TABLE "LancamentoDaFolha" ADD CONSTRAINT "LancamentoDaFolha_tipo_chk" CHECK ("tipo" <> 'VARIAVEL' OR "competenciaFim" = "competenciaInicio");
-- Alíquotas entre 0 e 1; valores não negativos; ordem positiva.
ALTER TABLE "FaixaDeContribuicao" ADD CONSTRAINT "FaixaDeContribuicao_aliquota_chk" CHECK ("aliquota" >= 0 AND "aliquota" <= 1 AND "ordem" >= 1 AND ("ate" IS NULL OR "ate" > 0));
ALTER TABLE "FaixaIrrf" ADD CONSTRAINT "FaixaIrrf_aliquota_chk" CHECK ("aliquota" >= 0 AND "aliquota" <= 1 AND "ordem" >= 1 AND ("ate" IS NULL OR "ate" > 0) AND "parcelaADeduzir" >= 0);
ALTER TABLE "TabelaDeContribuicao" ADD CONSTRAINT "TabelaDeContribuicao_valores_chk" CHECK (("teto" IS NULL OR "teto" > 0) AND ("aliquotaPatronal" IS NULL OR ("aliquotaPatronal" >= 0 AND "aliquotaPatronal" <= 1)));
ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_valores_chk" CHECK ("deducaoPorDependente" >= 0 AND ("descontoSimplificado" IS NULL OR "descontoSimplificado" >= 0) AND ("isencaoMaior65" IS NULL OR "isencaoMaior65" >= 0));
-- O redutor vem inteiro ou não vem.
ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_redutor_chk" CHECK (("redutorBase" IS NULL AND "redutorFator" IS NULL AND "redutorRendaMaxima" IS NULL) OR ("redutorBase" > 0 AND "redutorFator" > 0 AND "redutorRendaMaxima" > 0));
ALTER TABLE "TabelaSalarioFamilia" ADD CONSTRAINT "TabelaSalarioFamilia_valores_chk" CHECK ("rendaMaxima" > 0 AND "valorPorDependente" > 0 AND "idadeLimite" > 0);
-- Percentual só na natureza que o usa.
ALTER TABLE "Rubrica" ADD CONSTRAINT "Rubrica_percentual_chk" CHECK (("natureza" = 'PERCENTUAL_DO_VENCIMENTO' AND "percentual" IS NOT NULL AND "percentual" > 0) OR ("natureza" <> 'PERCENTUAL_DO_VENCIMENTO' AND "percentual" IS NULL));
ALTER TABLE "Rubrica" ADD CONSTRAINT "Rubrica_ordem_chk" CHECK ("ordem" >= 1);
ALTER TABLE "LancamentoDaFolha" ADD CONSTRAINT "LancamentoDaFolha_valor_chk" CHECK ("valor" > 0);
ALTER TABLE "CalculoDaFolha" ADD CONSTRAINT "CalculoDaFolha_numero_chk" CHECK ("numero" >= 1);
ALTER TABLE "Contracheque" ADD CONSTRAINT "Contracheque_dias_chk" CHECK ("diasComputados" >= 0 AND "diasComputados" <= 30);
ALTER TABLE "Contracheque" ADD CONSTRAINT "Contracheque_liquido_chk" CHECK ("liquido" = "totalProventos" - "totalDescontos");
