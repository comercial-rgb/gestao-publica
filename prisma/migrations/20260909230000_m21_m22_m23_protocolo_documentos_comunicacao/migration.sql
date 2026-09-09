-- CreateEnum
CREATE TYPE "FinalidadeDoProcesso" AS ENUM ('ATENDIMENTO_AO_PUBLICO', 'INTERNO');

-- CreateEnum
CREATE TYPE "PrioridadeDoProcesso" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "TipoMovimentoDoProcesso" AS ENUM ('TRAMITE', 'RECEBIMENTO', 'COMPLEMENTO', 'PARECER_SOLICITADO', 'PARECER_RESPONDIDO', 'READEQUACAO_SOLICITADA', 'READEQUACAO_ATENDIDA', 'PARALISACAO', 'ENCERRAMENTO', 'ARQUIVAMENTO', 'REABERTURA', 'CANCELAMENTO', 'ALTERACAO', 'TORNADO_SEM_EFEITO');

-- CreateEnum
CREATE TYPE "TipoMovimentoDeApensamento" AS ENUM ('APENSADO', 'DESAPENSADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoDaTaxa" AS ENUM ('PAGAMENTO', 'CANCELAMENTO');

-- CreateEnum
CREATE TYPE "OrigemDoAnexo" AS ENUM ('UPLOAD', 'DIGITALIZACAO', 'CAMERA', 'SISTEMA');

-- CreateEnum
CREATE TYPE "ModoDeAssinatura" AS ENUM ('SIMPLES', 'AVANCADA', 'QUALIFICADA');

-- CreateEnum
CREATE TYPE "TipoMovimentoDoComunicado" AS ENUM ('ENVIO', 'LEITURA', 'ENCAMINHAMENTO', 'ARQUIVAMENTO', 'DESARQUIVAMENTO', 'FAVORITADO', 'DESFAVORITADO');

-- CreateTable
CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assunto" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "textoOrientacao" TEXT,
    "termoDeAceite" TEXT,
    "permiteAnonimo" BOOLEAN NOT NULL DEFAULT false,
    "sigiloPadrao" BOOLEAN NOT NULL DEFAULT false,
    "bloqueiaTramiteComTaxaAberta" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Assunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subassunto" (
    "id" TEXT NOT NULL,
    "assuntoId" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Subassunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapaDoRoteiro" (
    "id" TEXT NOT NULL,
    "assuntoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "setorId" TEXT NOT NULL,
    "prazoDias" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EtapaDoRoteiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Processo" (
    "id" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigoVerificador" VARCHAR(12) NOT NULL,
    "assuntoId" TEXT NOT NULL,
    "subassuntoId" TEXT,
    "requerenteId" TEXT,
    "contatoAnonimo" TEXT,
    "finalidade" "FinalidadeDoProcesso" NOT NULL,
    "prioridade" "PrioridadeDoProcesso" NOT NULL DEFAULT 'NORMAL',
    "sigiloso" BOOLEAN NOT NULL DEFAULT false,
    "textoAbertura" TEXT NOT NULL,
    "documentacaoFisica" BOOLEAN NOT NULL DEFAULT false,
    "setorAberturaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapaDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "setorId" TEXT NOT NULL,
    "prazoDias" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "EtapaDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequerenteAdicionalDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RequerenteAdicionalDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoProcesso" NOT NULL,
    "setorOrigemId" TEXT,
    "setorDestinoId" TEXT,
    "usuarioDestino" TEXT,
    "texto" TEXT NOT NULL,
    "respondeAId" TEXT,
    "tornaSemEfeitoId" TEXT,
    "assinaturaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDeApensamento" (
    "id" TEXT NOT NULL,
    "processoPrincipalId" TEXT NOT NULL,
    "processoApensoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDeApensamento" NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDeApensamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxaDoProcesso" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TaxaDoProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaTaxa" (
    "id" TEXT NOT NULL,
    "taxaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaTaxa" NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaTaxa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "origem" "OrigemDoAnexo" NOT NULL DEFAULT 'UPLOAD',
    "processoId" TEXT,
    "movimentoProcessoId" TEXT,
    "comunicadoId" TEXT,
    "pessoaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssinaturaDeDocumento" (
    "id" TEXT NOT NULL,
    "modo" "ModoDeAssinatura" NOT NULL,
    "assinadoPor" TEXT NOT NULL,
    "hashConteudo" VARCHAR(64) NOT NULL,
    "anexoId" TEXT,
    "signatarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssinaturaDeDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilaDeAssinatura" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "modo" "ModoDeAssinatura" NOT NULL,
    "anexoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FilaDeAssinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatarioDaFila" (
    "id" TEXT NOT NULL,
    "filaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "usuarioIdent" TEXT NOT NULL,

    CONSTRAINT "SignatarioDaFila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDeComunicado" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "aceitaResposta" BOOLEAN NOT NULL DEFAULT true,
    "modoDeAssinaturaExigido" "ModoDeAssinatura",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TipoDeComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDeComunicadoPorSetor" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,

    CONSTRAINT "TipoDeComunicadoPorSetor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagDeComunicado" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TagDeComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagAplicadaAoComunicado" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "TagAplicadaAoComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comunicado" (
    "id" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipoId" TEXT NOT NULL,
    "setorRemetenteId" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3),
    "assinaturaId" TEXT,
    "respondeAId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinatarioDoComunicado" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "aosCuidadosDe" TEXT,
    "porEncaminhamento" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DestinatarioDoComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDoComunicado" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoComunicado" NOT NULL,
    "setorId" TEXT,
    "origem" TEXT,
    "assinaturaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setor_codigo_key" ON "Setor"("codigo");

-- CreateIndex
CREATE INDEX "Setor_unidadeOrcId_idx" ON "Setor"("unidadeOrcId");

-- CreateIndex
CREATE UNIQUE INDEX "Assunto_codigo_key" ON "Assunto"("codigo");

-- CreateIndex
CREATE INDEX "Subassunto_assuntoId_idx" ON "Subassunto"("assuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Subassunto_assuntoId_codigo_key" ON "Subassunto"("assuntoId", "codigo");

-- CreateIndex
CREATE INDEX "EtapaDoRoteiro_assuntoId_idx" ON "EtapaDoRoteiro"("assuntoId");

-- CreateIndex
CREATE INDEX "EtapaDoRoteiro_setorId_idx" ON "EtapaDoRoteiro"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "EtapaDoRoteiro_assuntoId_ordem_key" ON "EtapaDoRoteiro"("assuntoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Processo_codigoVerificador_key" ON "Processo"("codigoVerificador");

-- CreateIndex
CREATE INDEX "Processo_assuntoId_idx" ON "Processo"("assuntoId");

-- CreateIndex
CREATE INDEX "Processo_requerenteId_idx" ON "Processo"("requerenteId");

-- CreateIndex
CREATE INDEX "Processo_setorAberturaId_idx" ON "Processo"("setorAberturaId");

-- CreateIndex
CREATE INDEX "Processo_exercicioId_criadoEm_idx" ON "Processo"("exercicioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Processo_exercicioId_numero_key" ON "Processo"("exercicioId", "numero");

-- CreateIndex
CREATE INDEX "EtapaDoProcesso_processoId_idx" ON "EtapaDoProcesso"("processoId");

-- CreateIndex
CREATE INDEX "EtapaDoProcesso_setorId_idx" ON "EtapaDoProcesso"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "EtapaDoProcesso_processoId_ordem_key" ON "EtapaDoProcesso"("processoId", "ordem");

-- CreateIndex
CREATE INDEX "RequerenteAdicionalDoProcesso_processoId_idx" ON "RequerenteAdicionalDoProcesso"("processoId");

-- CreateIndex
CREATE INDEX "RequerenteAdicionalDoProcesso_pessoaId_idx" ON "RequerenteAdicionalDoProcesso"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "RequerenteAdicionalDoProcesso_processoId_pessoaId_key" ON "RequerenteAdicionalDoProcesso"("processoId", "pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDoProcesso_tornaSemEfeitoId_key" ON "MovimentoDoProcesso"("tornaSemEfeitoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDoProcesso_assinaturaId_key" ON "MovimentoDoProcesso"("assinaturaId");

-- CreateIndex
CREATE INDEX "MovimentoDoProcesso_processoId_idx" ON "MovimentoDoProcesso"("processoId");

-- CreateIndex
CREATE INDEX "MovimentoDoProcesso_processoId_criadoEm_idx" ON "MovimentoDoProcesso"("processoId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoDoProcesso_setorDestinoId_idx" ON "MovimentoDoProcesso"("setorDestinoId");

-- CreateIndex
CREATE INDEX "MovimentoDoProcesso_respondeAId_idx" ON "MovimentoDoProcesso"("respondeAId");

-- CreateIndex
CREATE INDEX "MovimentoDeApensamento_processoPrincipalId_idx" ON "MovimentoDeApensamento"("processoPrincipalId");

-- CreateIndex
CREATE INDEX "MovimentoDeApensamento_processoApensoId_idx" ON "MovimentoDeApensamento"("processoApensoId");

-- CreateIndex
CREATE INDEX "MovimentoDeApensamento_processoApensoId_criadoEm_idx" ON "MovimentoDeApensamento"("processoApensoId", "criadoEm");

-- CreateIndex
CREATE INDEX "TaxaDoProcesso_processoId_idx" ON "TaxaDoProcesso"("processoId");

-- CreateIndex
CREATE INDEX "MovimentoDaTaxa_taxaId_idx" ON "MovimentoDaTaxa"("taxaId");

-- CreateIndex
CREATE INDEX "MovimentoDaTaxa_taxaId_criadoEm_idx" ON "MovimentoDaTaxa"("taxaId", "criadoEm");

-- CreateIndex
CREATE INDEX "Anexo_processoId_idx" ON "Anexo"("processoId");

-- CreateIndex
CREATE INDEX "Anexo_movimentoProcessoId_idx" ON "Anexo"("movimentoProcessoId");

-- CreateIndex
CREATE INDEX "Anexo_comunicadoId_idx" ON "Anexo"("comunicadoId");

-- CreateIndex
CREATE INDEX "Anexo_pessoaId_idx" ON "Anexo"("pessoaId");

-- CreateIndex
CREATE INDEX "Anexo_sha256_idx" ON "Anexo"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "AssinaturaDeDocumento_signatarioId_key" ON "AssinaturaDeDocumento"("signatarioId");

-- CreateIndex
CREATE INDEX "AssinaturaDeDocumento_anexoId_idx" ON "AssinaturaDeDocumento"("anexoId");

-- CreateIndex
CREATE INDEX "AssinaturaDeDocumento_assinadoPor_idx" ON "AssinaturaDeDocumento"("assinadoPor");

-- CreateIndex
CREATE INDEX "AssinaturaDeDocumento_hashConteudo_idx" ON "AssinaturaDeDocumento"("hashConteudo");

-- CreateIndex
CREATE INDEX "SignatarioDaFila_usuarioIdent_idx" ON "SignatarioDaFila"("usuarioIdent");

-- CreateIndex
CREATE UNIQUE INDEX "SignatarioDaFila_filaId_ordem_key" ON "SignatarioDaFila"("filaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "SignatarioDaFila_filaId_usuarioIdent_key" ON "SignatarioDaFila"("filaId", "usuarioIdent");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDeComunicado_codigo_key" ON "TipoDeComunicado"("codigo");

-- CreateIndex
CREATE INDEX "TipoDeComunicadoPorSetor_setorId_idx" ON "TipoDeComunicadoPorSetor"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDeComunicadoPorSetor_tipoId_setorId_key" ON "TipoDeComunicadoPorSetor"("tipoId", "setorId");

-- CreateIndex
CREATE UNIQUE INDEX "TagDeComunicado_nome_key" ON "TagDeComunicado"("nome");

-- CreateIndex
CREATE INDEX "TagAplicadaAoComunicado_tagId_idx" ON "TagAplicadaAoComunicado"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "TagAplicadaAoComunicado_comunicadoId_tagId_key" ON "TagAplicadaAoComunicado"("comunicadoId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Comunicado_assinaturaId_key" ON "Comunicado"("assinaturaId");

-- CreateIndex
CREATE INDEX "Comunicado_tipoId_idx" ON "Comunicado"("tipoId");

-- CreateIndex
CREATE INDEX "Comunicado_setorRemetenteId_idx" ON "Comunicado"("setorRemetenteId");

-- CreateIndex
CREATE INDEX "Comunicado_respondeAId_idx" ON "Comunicado"("respondeAId");

-- CreateIndex
CREATE INDEX "Comunicado_exercicioId_criadoEm_idx" ON "Comunicado"("exercicioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Comunicado_exercicioId_tipoId_setorRemetenteId_numero_key" ON "Comunicado"("exercicioId", "tipoId", "setorRemetenteId", "numero");

-- CreateIndex
CREATE INDEX "DestinatarioDoComunicado_setorId_idx" ON "DestinatarioDoComunicado"("setorId");

-- CreateIndex
CREATE INDEX "DestinatarioDoComunicado_aosCuidadosDe_idx" ON "DestinatarioDoComunicado"("aosCuidadosDe");

-- CreateIndex
CREATE UNIQUE INDEX "DestinatarioDoComunicado_comunicadoId_setorId_key" ON "DestinatarioDoComunicado"("comunicadoId", "setorId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDoComunicado_assinaturaId_key" ON "MovimentoDoComunicado"("assinaturaId");

-- CreateIndex
CREATE INDEX "MovimentoDoComunicado_comunicadoId_idx" ON "MovimentoDoComunicado"("comunicadoId");

-- CreateIndex
CREATE INDEX "MovimentoDoComunicado_comunicadoId_criadoEm_idx" ON "MovimentoDoComunicado"("comunicadoId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoDoComunicado_criadoPor_idx" ON "MovimentoDoComunicado"("criadoPor");

-- AddForeignKey
ALTER TABLE "Setor" ADD CONSTRAINT "Setor_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subassunto" ADD CONSTRAINT "Subassunto_assuntoId_fkey" FOREIGN KEY ("assuntoId") REFERENCES "Assunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaDoRoteiro" ADD CONSTRAINT "EtapaDoRoteiro_assuntoId_fkey" FOREIGN KEY ("assuntoId") REFERENCES "Assunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaDoRoteiro" ADD CONSTRAINT "EtapaDoRoteiro_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_assuntoId_fkey" FOREIGN KEY ("assuntoId") REFERENCES "Assunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_subassuntoId_fkey" FOREIGN KEY ("subassuntoId") REFERENCES "Subassunto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_requerenteId_fkey" FOREIGN KEY ("requerenteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_setorAberturaId_fkey" FOREIGN KEY ("setorAberturaId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaDoProcesso" ADD CONSTRAINT "EtapaDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaDoProcesso" ADD CONSTRAINT "EtapaDoProcesso_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerenteAdicionalDoProcesso" ADD CONSTRAINT "RequerenteAdicionalDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerenteAdicionalDoProcesso" ADD CONSTRAINT "RequerenteAdicionalDoProcesso_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_setorOrigemId_fkey" FOREIGN KEY ("setorOrigemId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_setorDestinoId_fkey" FOREIGN KEY ("setorDestinoId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_respondeAId_fkey" FOREIGN KEY ("respondeAId") REFERENCES "MovimentoDoProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_tornaSemEfeitoId_fkey" FOREIGN KEY ("tornaSemEfeitoId") REFERENCES "MovimentoDoProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoProcesso" ADD CONSTRAINT "MovimentoDoProcesso_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "AssinaturaDeDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeApensamento" ADD CONSTRAINT "MovimentoDeApensamento_processoPrincipalId_fkey" FOREIGN KEY ("processoPrincipalId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeApensamento" ADD CONSTRAINT "MovimentoDeApensamento_processoApensoId_fkey" FOREIGN KEY ("processoApensoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxaDoProcesso" ADD CONSTRAINT "TaxaDoProcesso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaTaxa" ADD CONSTRAINT "MovimentoDaTaxa_taxaId_fkey" FOREIGN KEY ("taxaId") REFERENCES "TaxaDoProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_movimentoProcessoId_fkey" FOREIGN KEY ("movimentoProcessoId") REFERENCES "MovimentoDoProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssinaturaDeDocumento" ADD CONSTRAINT "AssinaturaDeDocumento_anexoId_fkey" FOREIGN KEY ("anexoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssinaturaDeDocumento" ADD CONSTRAINT "AssinaturaDeDocumento_signatarioId_fkey" FOREIGN KEY ("signatarioId") REFERENCES "SignatarioDaFila"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilaDeAssinatura" ADD CONSTRAINT "FilaDeAssinatura_anexoId_fkey" FOREIGN KEY ("anexoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatarioDaFila" ADD CONSTRAINT "SignatarioDaFila_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "FilaDeAssinatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipoDeComunicadoPorSetor" ADD CONSTRAINT "TipoDeComunicadoPorSetor_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoDeComunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipoDeComunicadoPorSetor" ADD CONSTRAINT "TipoDeComunicadoPorSetor_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAplicadaAoComunicado" ADD CONSTRAINT "TagAplicadaAoComunicado_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAplicadaAoComunicado" ADD CONSTRAINT "TagAplicadaAoComunicado_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDeComunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoDeComunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_setorRemetenteId_fkey" FOREIGN KEY ("setorRemetenteId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "AssinaturaDeDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_respondeAId_fkey" FOREIGN KEY ("respondeAId") REFERENCES "Comunicado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinatarioDoComunicado" ADD CONSTRAINT "DestinatarioDoComunicado_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinatarioDoComunicado" ADD CONSTRAINT "DestinatarioDoComunicado_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoComunicado" ADD CONSTRAINT "MovimentoDoComunicado_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoComunicado" ADD CONSTRAINT "MovimentoDoComunicado_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDoComunicado" ADD CONSTRAINT "MovimentoDoComunicado_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "AssinaturaDeDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

