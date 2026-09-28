-- V19/C05 — A APROPRIACAO DE CUSTO POR CENTRO.
--
-- ⚠️ O CENTRO DE CUSTO E O `Setor`, E NAO HA CADASTRO NOVO. A decisao e anterior a esta migration
-- (`m21-protocolo.prisma:89`, `m32-pessoal.prisma:678`): o centro de custo de um vinculo e um Setor,
-- "em vez de num quarto organograma". Um model proprio seria o segundo organograma do ente.
--
-- ⚠️ E A APROPRIACAO NAO LANCA NO RAZAO. A prova de C05 e literal — "composicao rastreavel SEM
-- LANCAR NOVAMENTE a mesma despesa". A despesa foi reconhecida na liquidacao; lancar de novo
-- duplicaria a variacao patrimonial diminutiva. Estas tabelas sao dimensao gerencial sobre um fato
-- que ja existe: elas REFERENCIAM a liquidacao.
--
-- ⚠️ MIGRATION ADITIVA: quatro tabelas novas e um enum novo. Zero DROP, zero ALTER em tabela
-- existente — as back-relations do `Setor` e da `Liquidacao` sao campos VIRTUAIS do Prisma.
--
-- Validada em banco ISOLADO (gestao_publica_isolado_v19_c05) antes de depender da estrutura.

-- CreateEnum
CREATE TYPE "BaseDeRateioDeCusto" AS ENUM ('PERCENTUAL_DECLARADO');

-- CreateTable
CREATE TABLE "CriterioDeRateioDeCusto" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "base" "BaseDeRateioDeCusto" NOT NULL DEFAULT 'PERCENTUAL_DECLARADO',
    "atoRef" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "centroDoResiduoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

CONSTRAINT "CriterioDeRateioDeCusto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoCriterioDeRateio" (
    "id" TEXT NOT NULL,
    "criterioId" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,
    "percentual" DECIMAL(9,6) NOT NULL,

CONSTRAINT "ItemDoCriterioDeRateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApropriacaoDeCusto" (
    "id" TEXT NOT NULL,
    "liquidacaoId" TEXT NOT NULL,
    "criterioId" TEXT,
    "competencia" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

CONSTRAINT "ApropriacaoDeCusto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaApropriacaoDeCusto" (
    "id" TEXT NOT NULL,
    "apropriacaoId" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

CONSTRAINT "ItemDaApropriacaoDeCusto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CriterioDeRateioDeCusto_chave_vigenteDesde_idx" ON "CriterioDeRateioDeCusto"("chave", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "CriterioDeRateioDeCusto_chave_versao_key" ON "CriterioDeRateioDeCusto"("chave", "versao");

-- CreateIndex
CREATE INDEX "ItemDoCriterioDeRateio_centroId_idx" ON "ItemDoCriterioDeRateio"("centroId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoCriterioDeRateio_criterioId_centroId_key" ON "ItemDoCriterioDeRateio"("criterioId", "centroId");

-- CreateIndex
CREATE INDEX "ApropriacaoDeCusto_liquidacaoId_idx" ON "ApropriacaoDeCusto"("liquidacaoId");

-- CreateIndex
CREATE INDEX "ApropriacaoDeCusto_competencia_idx" ON "ApropriacaoDeCusto"("competencia");

-- CreateIndex
CREATE INDEX "ApropriacaoDeCusto_criterioId_idx" ON "ApropriacaoDeCusto"("criterioId");

-- CreateIndex
CREATE INDEX "ItemDaApropriacaoDeCusto_centroId_idx" ON "ItemDaApropriacaoDeCusto"("centroId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaApropriacaoDeCusto_apropriacaoId_centroId_key" ON "ItemDaApropriacaoDeCusto"("apropriacaoId", "centroId");

-- AddForeignKey
ALTER TABLE "CriterioDeRateioDeCusto" ADD CONSTRAINT "CriterioDeRateioDeCusto_centroDoResiduoId_fkey" FOREIGN KEY ("centroDoResiduoId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoCriterioDeRateio" ADD CONSTRAINT "ItemDoCriterioDeRateio_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioDeRateioDeCusto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoCriterioDeRateio" ADD CONSTRAINT "ItemDoCriterioDeRateio_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApropriacaoDeCusto" ADD CONSTRAINT "ApropriacaoDeCusto_liquidacaoId_fkey" FOREIGN KEY ("liquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApropriacaoDeCusto" ADD CONSTRAINT "ApropriacaoDeCusto_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioDeRateioDeCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaApropriacaoDeCusto" ADD CONSTRAINT "ItemDaApropriacaoDeCusto_apropriacaoId_fkey" FOREIGN KEY ("apropriacaoId") REFERENCES "ApropriacaoDeCusto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaApropriacaoDeCusto" ADD CONSTRAINT "ItemDaApropriacaoDeCusto_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
