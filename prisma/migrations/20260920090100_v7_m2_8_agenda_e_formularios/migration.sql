-- V7 M2 U8 — a agenda da fiscalização (horário, duração, local; reagendamento, cancelamento e realização) e os
-- tipos de ocorrência do ente com formulários versionados. Aditiva: colunas nullable e tabelas novas, nenhum DROP.

-- CreateEnum
CREATE TYPE "TipoDeRespostaDoFormulario" AS ENUM ('TEXTO', 'NUMERO', 'DATA', 'OPCAO', 'SIM_NAO');

-- CreateEnum
CREATE TYPE "GravidadeDaOcorrencia" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD COLUMN     "gravidade" "GravidadeDaOcorrencia",
ADD COLUMN     "versaoDoTipoId" TEXT;

-- AlterTable
ALTER TABLE "OrdemDeFiscalizacao" ADD COLUMN     "duracaoMinutos" INTEGER,
ADD COLUMN     "horaInicio" VARCHAR(5),
ADD COLUMN     "local" TEXT;

-- CreateTable
CREATE TABLE "ReagendamentoDeFiscalizacao" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "horaInicio" VARCHAR(5),
    "duracaoMinutos" INTEGER,
    "local" TEXT,
    "motivo" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ReagendamentoDeFiscalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDeFiscalizacao" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CancelamentoDeFiscalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealizacaoDeFiscalizacao" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horaInicio" VARCHAR(5),
    "horaFim" VARCHAR(5),
    "relato" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RealizacaoDeFiscalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDeOcorrenciaDoEnte" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "natureza" "TipoDeOcorrencia" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TipoDeOcorrenciaDoEnte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoTipoDeOcorrencia" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "exigeGravidade" BOOLEAN NOT NULL,
    "encaminhamentoPadrao" "EncaminhamentoDaOcorrencia" NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoTipoDeOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MudancaDeSituacaoDoTipoDeOcorrencia" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MudancaDeSituacaoDoTipoDeOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerguntaDoFormularioDeOcorrencia" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tipoDeResposta" "TipoDeRespostaDoFormulario" NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL,
    "opcoes" TEXT[],

    CONSTRAINT "PerguntaDoFormularioDeOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaDoFormularioDeOcorrencia" (
    "id" TEXT NOT NULL,
    "ocorrenciaId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RespostaDoFormularioDeOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReagendamentoDeFiscalizacao_ordemId_idx" ON "ReagendamentoDeFiscalizacao"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDeFiscalizacao_ordemId_key" ON "CancelamentoDeFiscalizacao"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "RealizacaoDeFiscalizacao_ordemId_key" ON "RealizacaoDeFiscalizacao"("ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDeOcorrenciaDoEnte_codigo_key" ON "TipoDeOcorrenciaDoEnte"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoTipoDeOcorrencia_tipoId_versao_key" ON "VersaoDoTipoDeOcorrencia"("tipoId", "versao");

-- CreateIndex
CREATE INDEX "MudancaDeSituacaoDoTipoDeOcorrencia_tipoId_idx" ON "MudancaDeSituacaoDoTipoDeOcorrencia"("tipoId");

-- CreateIndex
CREATE INDEX "PerguntaDoFormularioDeOcorrencia_versaoId_ordem_idx" ON "PerguntaDoFormularioDeOcorrencia"("versaoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "PerguntaDoFormularioDeOcorrencia_versaoId_codigo_key" ON "PerguntaDoFormularioDeOcorrencia"("versaoId", "codigo");

-- CreateIndex
CREATE INDEX "RespostaDoFormularioDeOcorrencia_perguntaId_idx" ON "RespostaDoFormularioDeOcorrencia"("perguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaDoFormularioDeOcorrencia_ocorrenciaId_perguntaId_key" ON "RespostaDoFormularioDeOcorrencia"("ocorrenciaId", "perguntaId");

-- AddForeignKey
ALTER TABLE "ReagendamentoDeFiscalizacao" ADD CONSTRAINT "ReagendamentoDeFiscalizacao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagendamentoDeFiscalizacao" ADD CONSTRAINT "ReagendamentoDeFiscalizacao_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDeFiscalizacao" ADD CONSTRAINT "CancelamentoDeFiscalizacao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDeFiscalizacao" ADD CONSTRAINT "CancelamentoDeFiscalizacao_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizacaoDeFiscalizacao" ADD CONSTRAINT "RealizacaoDeFiscalizacao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizacaoDeFiscalizacao" ADD CONSTRAINT "RealizacaoDeFiscalizacao_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoDoTipoDeOcorrencia" ADD CONSTRAINT "VersaoDoTipoDeOcorrencia_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoDeOcorrenciaDoEnte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MudancaDeSituacaoDoTipoDeOcorrencia" ADD CONSTRAINT "MudancaDeSituacaoDoTipoDeOcorrencia_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoDeOcorrenciaDoEnte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerguntaDoFormularioDeOcorrencia" ADD CONSTRAINT "PerguntaDoFormularioDeOcorrencia_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoTipoDeOcorrencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaDoFormularioDeOcorrencia" ADD CONSTRAINT "RespostaDoFormularioDeOcorrencia_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "OcorrenciaDeFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaDoFormularioDeOcorrencia" ADD CONSTRAINT "RespostaDoFormularioDeOcorrencia_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "PerguntaDoFormularioDeOcorrencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcorrenciaDeFiscalizacao" ADD CONSTRAINT "OcorrenciaDeFiscalizacao_versaoDoTipoId_fkey" FOREIGN KEY ("versaoDoTipoId") REFERENCES "VersaoDoTipoDeOcorrencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks que o Prisma não representa (a regra continua no caso de uso; o banco recusa a linha impossível).
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "ck_ordem_fiscalizacao_hora" CHECK ("horaInicio" IS NULL OR "horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "OrdemDeFiscalizacao" ADD CONSTRAINT "ck_ordem_fiscalizacao_duracao" CHECK ("duracaoMinutos" IS NULL OR ("duracaoMinutos" > 0 AND "duracaoMinutos" <= 1440));
ALTER TABLE "ReagendamentoDeFiscalizacao" ADD CONSTRAINT "ck_reagendamento_hora" CHECK ("horaInicio" IS NULL OR "horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "ReagendamentoDeFiscalizacao" ADD CONSTRAINT "ck_reagendamento_duracao" CHECK ("duracaoMinutos" IS NULL OR ("duracaoMinutos" > 0 AND "duracaoMinutos" <= 1440));
ALTER TABLE "RealizacaoDeFiscalizacao" ADD CONSTRAINT "ck_realizacao_horas" CHECK (("horaInicio" IS NULL OR "horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND ("horaFim" IS NULL OR "horaFim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND ("horaInicio" IS NULL OR "horaFim" IS NULL OR "horaFim" >= "horaInicio"));
ALTER TABLE "VersaoDoTipoDeOcorrencia" ADD CONSTRAINT "ck_versao_do_tipo_positiva" CHECK ("versao" >= 1);
ALTER TABLE "PerguntaDoFormularioDeOcorrencia" ADD CONSTRAINT "ck_pergunta_ordem_positiva" CHECK ("ordem" >= 1);
ALTER TABLE "PerguntaDoFormularioDeOcorrencia" ADD CONSTRAINT "ck_pergunta_opcoes" CHECK (("tipoDeResposta" = 'OPCAO' AND array_length("opcoes", 1) >= 2) OR ("tipoDeResposta" <> 'OPCAO' AND array_length("opcoes", 1) IS NULL));
