-- CreateEnum
CREATE TYPE "TipoDeManifestacao" AS ENUM ('DENUNCIA', 'DUVIDA', 'SUGESTAO', 'RECLAMACAO', 'ELOGIO');

-- CreateEnum
CREATE TYPE "OrigemDaAvaliacao" AS ENUM ('ATENDIMENTO_COMPROVADO', 'OPINIAO_GERAL');

-- CreateEnum
CREATE TYPE "MotivoDeRemocaoDaAvaliacao" AS ENUM ('ABUSO', 'DADOS_PESSOAIS');

-- CreateTable
CREATE TABLE "ManifestacaoDeOuvidoria" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "tipo" "TipoDeManifestacao" NOT NULL,
    "hashDoSegredo" TEXT NOT NULL,
    "contato" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManifestacaoDeOuvidoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriagemDaManifestacao" (
    "id" TEXT NOT NULL,
    "manifestacaoId" TEXT NOT NULL,
    "tipoConfirmado" "TipoDeManifestacao" NOT NULL,
    "anotacaoInterna" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TriagemDaManifestacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaDaOuvidoria" (
    "id" TEXT NOT NULL,
    "manifestacaoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "conclusiva" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RespostaDaOuvidoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioPublicoSemConta" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioPublicoSemConta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetodologiaDeAvaliacao" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "escalaMinima" INTEGER NOT NULL,
    "escalaMaxima" INTEGER NOT NULL,
    "rotulos" JSONB NOT NULL,
    "descricaoDoMetodo" TEXT NOT NULL,
    "periodoMeses" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MetodologiaDeAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoDeServico" (
    "id" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "metodologiaId" TEXT NOT NULL,
    "origem" "OrigemDaAvaliacao" NOT NULL,
    "solicitacaoId" TEXT,
    "chaveDoAvaliador" TEXT NOT NULL,
    "revisaoDeId" TEXT,
    "satisfacao" INTEGER NOT NULL,
    "atendimento" INTEGER NOT NULL,
    "prazos" INTEGER NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,

    CONSTRAINT "AvaliacaoDeServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemocaoDeAvaliacao" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "motivo" "MotivoDeRemocaoDaAvaliacao" NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RemocaoDeAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManifestacaoDeOuvidoria_processoId_key" ON "ManifestacaoDeOuvidoria"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "ManifestacaoDeOuvidoria_hashDoSegredo_key" ON "ManifestacaoDeOuvidoria"("hashDoSegredo");

-- CreateIndex
CREATE UNIQUE INDEX "TriagemDaManifestacao_manifestacaoId_key" ON "TriagemDaManifestacao"("manifestacaoId");

-- CreateIndex
CREATE INDEX "RespostaDaOuvidoria_manifestacaoId_idx" ON "RespostaDaOuvidoria"("manifestacaoId");

-- CreateIndex
CREATE INDEX "EnvioPublicoSemConta_chave_criadoEm_idx" ON "EnvioPublicoSemConta"("chave", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "MetodologiaDeAvaliacao_versao_key" ON "MetodologiaDeAvaliacao"("versao");

-- CreateIndex
CREATE UNIQUE INDEX "AvaliacaoDeServico_revisaoDeId_key" ON "AvaliacaoDeServico"("revisaoDeId");

-- CreateIndex
CREATE INDEX "AvaliacaoDeServico_servicoId_origem_idx" ON "AvaliacaoDeServico"("servicoId", "origem");

-- CreateIndex
CREATE INDEX "AvaliacaoDeServico_chaveDoAvaliador_idx" ON "AvaliacaoDeServico"("chaveDoAvaliador");

-- CreateIndex
CREATE UNIQUE INDEX "RemocaoDeAvaliacao_avaliacaoId_key" ON "RemocaoDeAvaliacao"("avaliacaoId");

-- AddForeignKey
ALTER TABLE "ManifestacaoDeOuvidoria" ADD CONSTRAINT "ManifestacaoDeOuvidoria_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriagemDaManifestacao" ADD CONSTRAINT "TriagemDaManifestacao_manifestacaoId_fkey" FOREIGN KEY ("manifestacaoId") REFERENCES "ManifestacaoDeOuvidoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaDaOuvidoria" ADD CONSTRAINT "RespostaDaOuvidoria_manifestacaoId_fkey" FOREIGN KEY ("manifestacaoId") REFERENCES "ManifestacaoDeOuvidoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoDeServico" ADD CONSTRAINT "AvaliacaoDeServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ServicoDaCarta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoDeServico" ADD CONSTRAINT "AvaliacaoDeServico_metodologiaId_fkey" FOREIGN KEY ("metodologiaId") REFERENCES "MetodologiaDeAvaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoDeServico" ADD CONSTRAINT "AvaliacaoDeServico_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoDeServico" ADD CONSTRAINT "AvaliacaoDeServico_revisaoDeId_fkey" FOREIGN KEY ("revisaoDeId") REFERENCES "AvaliacaoDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemocaoDeAvaliacao" ADD CONSTRAINT "RemocaoDeAvaliacao_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "AvaliacaoDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- V7 M1 U4 — invariantes que o Prisma não expressa.
ALTER TABLE "MetodologiaDeAvaliacao" ADD CONSTRAINT "ck_metodologia_escala" CHECK ("escalaMinima" >= 0 AND "escalaMaxima" > "escalaMinima" AND "escalaMaxima" <= 10 AND "periodoMeses" BETWEEN 1 AND 60);
ALTER TABLE "AvaliacaoDeServico" ADD CONSTRAINT "ck_avaliacao_origem" CHECK (("origem" = 'ATENDIMENTO_COMPROVADO') = ("solicitacaoId" IS NOT NULL));
-- UMA avaliação-raiz por avaliador e serviço: a segunda vez é revisão encadeada, não segundo voto.
CREATE UNIQUE INDEX "uq_avaliacao_raiz_por_avaliador" ON "AvaliacaoDeServico" ("servicoId", "chaveDoAvaliador") WHERE "revisaoDeId" IS NULL;
ALTER TABLE "RespostaDaOuvidoria" ADD CONSTRAINT "ck_resposta_texto" CHECK (length(btrim("texto")) >= 10);
