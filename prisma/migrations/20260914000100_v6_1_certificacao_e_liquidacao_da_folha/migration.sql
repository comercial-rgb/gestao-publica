-- V6.1 — a certificação (atesto) da folha e a sua liquidação.
-- DDL gerada por `prisma migrate diff`; o CHECK ao final é deste repositório.
-- Aditiva: zero DROP, zero ALTER de coluna existente.

-- CreateEnum
CREATE TYPE "AtribuicaoNaFolha" AS ENUM ('CERTIFICAR_FOLHA');

-- CreateEnum
CREATE TYPE "TipoDeCertificacao" AS ENUM ('CERTIFICACAO', 'DEVOLUCAO');

-- CreateTable
CREATE TABLE "DesignacaoNaFolha" (
    "id" TEXT NOT NULL,
    "atribuicao" "AtribuicaoNaFolha" NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "atoDesignacao" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "substitutoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DesignacaoNaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevogacaoDeDesignacao" (
    "id" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RevogacaoDeDesignacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificacaoDaFolha" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "tipo" "TipoDeCertificacao" NOT NULL,
    "motivo" TEXT,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "vinculos" INTEGER NOT NULL,
    "totalProventos" DECIMAL(18,2) NOT NULL,
    "totalDescontos" DECIMAL(18,2) NOT NULL,
    "totalLiquido" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CertificacaoDaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacaoDaFolha" (
    "id" TEXT NOT NULL,
    "empenhoDaFolhaId" TEXT NOT NULL,
    "certificacaoId" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LiquidacaoDaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignacaoNaFolha_atribuicao_vigenciaInicio_idx" ON "DesignacaoNaFolha"("atribuicao", "vigenciaInicio");

-- CreateIndex
CREATE INDEX "DesignacaoNaFolha_usuarioId_idx" ON "DesignacaoNaFolha"("usuarioId");

-- CreateIndex
CREATE INDEX "DesignacaoNaFolha_pessoaId_idx" ON "DesignacaoNaFolha"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "RevogacaoDeDesignacao_designacaoId_key" ON "RevogacaoDeDesignacao"("designacaoId");

-- CreateIndex
CREATE INDEX "CertificacaoDaFolha_folhaId_criadoEm_idx" ON "CertificacaoDaFolha"("folhaId", "criadoEm");

-- CreateIndex
CREATE INDEX "CertificacaoDaFolha_calculoId_criadoEm_idx" ON "CertificacaoDaFolha"("calculoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacaoDaFolha_empenhoDaFolhaId_key" ON "LiquidacaoDaFolha"("empenhoDaFolhaId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacaoDaFolha_liquidacaoId_key" ON "LiquidacaoDaFolha"("liquidacaoId");

-- CreateIndex
CREATE INDEX "LiquidacaoDaFolha_certificacaoId_idx" ON "LiquidacaoDaFolha"("certificacaoId");

-- AddForeignKey
ALTER TABLE "DesignacaoNaFolha" ADD CONSTRAINT "DesignacaoNaFolha_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignacaoNaFolha" ADD CONSTRAINT "DesignacaoNaFolha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignacaoNaFolha" ADD CONSTRAINT "DesignacaoNaFolha_substitutoDeId_fkey" FOREIGN KEY ("substitutoDeId") REFERENCES "DesignacaoNaFolha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevogacaoDeDesignacao" ADD CONSTRAINT "RevogacaoDeDesignacao_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoDaFolha" ADD CONSTRAINT "CertificacaoDaFolha_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoDaFolha" ADD CONSTRAINT "CertificacaoDaFolha_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoDaFolha" ADD CONSTRAINT "CertificacaoDaFolha_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDaFolha" ADD CONSTRAINT "LiquidacaoDaFolha_empenhoDaFolhaId_fkey" FOREIGN KEY ("empenhoDaFolhaId") REFERENCES "EmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDaFolha" ADD CONSTRAINT "LiquidacaoDaFolha_certificacaoId_fkey" FOREIGN KEY ("certificacaoId") REFERENCES "CertificacaoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacaoDaFolha" ADD CONSTRAINT "LiquidacaoDaFolha_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ⚠️ DEVOLVER SEM MOTIVO É DEVOLVER NADA. O Zod já exige, mas o banco é a última linha: uma
-- devolução sem motivo deixaria RH sem saber o que corrigir, e o histórico sem dizer por quê.
ALTER TABLE "CertificacaoDaFolha"
  ADD CONSTRAINT "ck_certificacao_devolucao_com_motivo"
  CHECK ("tipo" <> 'DEVOLUCAO' OR ("motivo" IS NOT NULL AND length(btrim("motivo")) >= 3));

-- ⚠️ VIGÊNCIA COERENTE. Fim antes do início criaria uma designação que nunca vigorou e que, por
-- isso, nunca recusaria nada explicitamente — recusaria tudo por acidente.
ALTER TABLE "DesignacaoNaFolha"
  ADD CONSTRAINT "ck_designacao_vigencia_coerente"
  CHECK ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio");

-- ⚠️ UMA DESIGNAÇÃO NÃO É SUBSTITUTA DE SI MESMA.
ALTER TABLE "DesignacaoNaFolha"
  ADD CONSTRAINT "ck_designacao_substituto_de_outra"
  CHECK ("substitutoDeId" IS NULL OR "substitutoDeId" <> "id");

-- ⚠️ ATO DE DESIGNAÇÃO NÃO É CAMPO DECORATIVO: sem ele o atesto fica sem fundamento.
ALTER TABLE "DesignacaoNaFolha"
  ADD CONSTRAINT "ck_designacao_ato_preenchido"
  CHECK (length(btrim("atoDesignacao")) >= 3);
