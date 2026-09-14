-- V6.2 — P3: carta de servicos (M21), representacao de pessoa e proposta cadastral (M19).
-- DDL gerada por prisma migrate diff; os CHECKs ao final sao deste repositorio. Aditiva: zero DROP.
-- CreateEnum
CREATE TYPE "TipoDeServicoDaCarta" AS ENUM ('REQUERIMENTO_ADMINISTRATIVO', 'ATUALIZACAO_CADASTRAL', 'COMPLEMENTO_DE_FORNECEDOR');

-- CreateEnum
CREATE TYPE "PublicoDoServico" AS ENUM ('CIDADAO', 'FORNECEDOR', 'SERVIDOR');

-- CreateEnum
CREATE TYPE "ResultadoDaSolicitacao" AS ENUM ('DEFERIDA', 'INDEFERIDA');

-- CreateEnum
CREATE TYPE "OrigemDoAnexoDaSolicitacao" AS ENUM ('REQUERENTE', 'RESPOSTA');

-- CreateTable
CREATE TABLE "RepresentacaoDePessoa" (
    "id" TEXT NOT NULL,
    "representadaId" TEXT NOT NULL,
    "representanteUsuarioId" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RepresentacaoDePessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevogacaoDeRepresentacao" (
    "id" TEXT NOT NULL,
    "representacaoId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RevogacaoDeRepresentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaDeAlteracaoCadastral" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "versaoBaseId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "versaoAplicadaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PropostaDeAlteracaoCadastral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicoDaCarta" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "publico" "PublicoDoServico" NOT NULL,
    "tipo" "TipoDeServicoDaCarta" NOT NULL,
    "assuntoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ServicoDaCarta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDoServico" (
    "id" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "requisitos" TEXT NOT NULL,
    "documentos" TEXT[],
    "canais" TEXT NOT NULL,
    "custo" TEXT,
    "prazoDias" INTEGER,
    "fundamentoDoPrazo" TEXT,
    "exigeAutenticacao" BOOLEAN NOT NULL,
    "setorDeEntradaId" TEXT NOT NULL,
    "campos" JSONB NOT NULL,
    "etapasPublicadas" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicacaoDoServico" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PublicacaoDoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoDeServico" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "titularId" TEXT NOT NULL,
    "representacaoId" TEXT,
    "respostas" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SolicitacaoDeServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisaoDaSolicitacao" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "resultado" "ResultadoDaSolicitacao" NOT NULL,
    "mensagemAoRequerente" TEXT NOT NULL,
    "fundamentoInterno" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DecisaoDaSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnexoDaSolicitacao" (
    "id" TEXT NOT NULL,
    "anexoId" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "origem" "OrigemDoAnexoDaSolicitacao" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnexoDaSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepresentacaoDePessoa_representadaId_idx" ON "RepresentacaoDePessoa"("representadaId");

-- CreateIndex
CREATE INDEX "RepresentacaoDePessoa_representanteUsuarioId_idx" ON "RepresentacaoDePessoa"("representanteUsuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "RevogacaoDeRepresentacao_representacaoId_key" ON "RevogacaoDeRepresentacao"("representacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaDeAlteracaoCadastral_solicitacaoId_key" ON "PropostaDeAlteracaoCadastral"("solicitacaoId");

-- CreateIndex
CREATE INDEX "PropostaDeAlteracaoCadastral_pessoaId_idx" ON "PropostaDeAlteracaoCadastral"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicoDaCarta_slug_key" ON "ServicoDaCarta"("slug");

-- CreateIndex
CREATE INDEX "ServicoDaCarta_assuntoId_idx" ON "ServicoDaCarta"("assuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDoServico_servicoId_numero_key" ON "VersaoDoServico"("servicoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PublicacaoDoServico_versaoId_key" ON "PublicacaoDoServico"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoDeServico_processoId_key" ON "SolicitacaoDeServico"("processoId");

-- CreateIndex
CREATE INDEX "SolicitacaoDeServico_titularId_idx" ON "SolicitacaoDeServico"("titularId");

-- CreateIndex
CREATE INDEX "SolicitacaoDeServico_versaoId_idx" ON "SolicitacaoDeServico"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisaoDaSolicitacao_solicitacaoId_key" ON "DecisaoDaSolicitacao"("solicitacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "AnexoDaSolicitacao_anexoId_key" ON "AnexoDaSolicitacao"("anexoId");

-- CreateIndex
CREATE INDEX "AnexoDaSolicitacao_solicitacaoId_idx" ON "AnexoDaSolicitacao"("solicitacaoId");

-- AddForeignKey
ALTER TABLE "RepresentacaoDePessoa" ADD CONSTRAINT "RepresentacaoDePessoa_representadaId_fkey" FOREIGN KEY ("representadaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentacaoDePessoa" ADD CONSTRAINT "RepresentacaoDePessoa_representanteUsuarioId_fkey" FOREIGN KEY ("representanteUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevogacaoDeRepresentacao" ADD CONSTRAINT "RevogacaoDeRepresentacao_representacaoId_fkey" FOREIGN KEY ("representacaoId") REFERENCES "RepresentacaoDePessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaDeAlteracaoCadastral" ADD CONSTRAINT "PropostaDeAlteracaoCadastral_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaDeAlteracaoCadastral" ADD CONSTRAINT "PropostaDeAlteracaoCadastral_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicoDaCarta" ADD CONSTRAINT "ServicoDaCarta_assuntoId_fkey" FOREIGN KEY ("assuntoId") REFERENCES "Assunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoDoServico" ADD CONSTRAINT "VersaoDoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ServicoDaCarta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoDoServico" ADD CONSTRAINT "VersaoDoServico_setorDeEntradaId_fkey" FOREIGN KEY ("setorDeEntradaId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicacaoDoServico" ADD CONSTRAINT "PublicacaoDoServico_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeServico" ADD CONSTRAINT "SolicitacaoDeServico_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoDoServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeServico" ADD CONSTRAINT "SolicitacaoDeServico_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeServico" ADD CONSTRAINT "SolicitacaoDeServico_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeServico" ADD CONSTRAINT "SolicitacaoDeServico_representacaoId_fkey" FOREIGN KEY ("representacaoId") REFERENCES "RepresentacaoDePessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisaoDaSolicitacao" ADD CONSTRAINT "DecisaoDaSolicitacao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnexoDaSolicitacao" ADD CONSTRAINT "AnexoDaSolicitacao_anexoId_fkey" FOREIGN KEY ("anexoId") REFERENCES "Anexo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnexoDaSolicitacao" ADD CONSTRAINT "AnexoDaSolicitacao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ CHECKs do repositorio ═══
-- Prazo e fundamento: os dois ou nenhum. Prazo sem fundamento e prazo inventado.
ALTER TABLE "VersaoDoServico" ADD CONSTRAINT "ck_versao_do_servico_prazo"
  CHECK (("prazoDias" IS NULL AND "fundamentoDoPrazo" IS NULL) OR ("prazoDias" > 0 AND length(btrim("fundamentoDoPrazo")) >= 5));
ALTER TABLE "VersaoDoServico" ADD CONSTRAINT "ck_versao_do_servico_numero" CHECK ("numero" >= 1);
ALTER TABLE "ServicoDaCarta" ADD CONSTRAINT "ck_servico_da_carta_slug" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "DecisaoDaSolicitacao" ADD CONSTRAINT "ck_decisao_da_solicitacao_textos"
  CHECK (length(btrim("mensagemAoRequerente")) >= 10 AND length(btrim("fundamentoInterno")) >= 5);
ALTER TABLE "RepresentacaoDePessoa" ADD CONSTRAINT "ck_representacao_vigencia"
  CHECK ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio");
ALTER TABLE "RepresentacaoDePessoa" ADD CONSTRAINT "ck_representacao_fundamento" CHECK (length(btrim("fundamento")) >= 5);
