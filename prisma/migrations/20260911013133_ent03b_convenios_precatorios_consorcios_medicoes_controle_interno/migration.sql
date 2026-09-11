-- CreateEnum
CREATE TYPE "PapelNoConvenio" AS ENUM ('CONCEDENTE', 'CONVENENTE');

-- CreateEnum
CREATE TYPE "TipoMovimentoConvenio" AS ENUM ('LIBERACAO_DE_PARCELA', 'PRESTACAO_APROVADA', 'GLOSA', 'DEVOLUCAO', 'ESTORNO_LIBERACAO_DE_PARCELA', 'ESTORNO_PRESTACAO_APROVADA', 'ESTORNO_GLOSA', 'ESTORNO_DEVOLUCAO');

-- CreateEnum
CREATE TYPE "NaturezaDoPrecatorio" AS ENUM ('ALIMENTAR', 'COMUM');

-- CreateEnum
CREATE TYPE "PreferenciaDoPrecatorio" AS ENUM ('NENHUMA', 'IDOSO', 'DOENCA_GRAVE', 'DEFICIENCIA');

-- CreateEnum
CREATE TYPE "TipoMovimentoPrecatorio" AS ENUM ('INSCRICAO', 'ATUALIZACAO', 'PAGAMENTO', 'CANCELAMENTO', 'ESTORNO_INSCRICAO', 'ESTORNO_ATUALIZACAO', 'ESTORNO_PAGAMENTO', 'ESTORNO_CANCELAMENTO');

-- CreateEnum
CREATE TYPE "TipoMovimentoConsorcio" AS ENUM ('REPASSE', 'DEVOLUCAO', 'ESTORNO_REPASSE', 'ESTORNO_DEVOLUCAO');

-- CreateEnum
CREATE TYPE "TipoDeAuditoria" AS ENUM ('PROGRAMADA', 'EXTRAORDINARIA', 'MONITORAMENTO');

-- CreateEnum
CREATE TYPE "RespostaDoChecklist" AS ENUM ('CONFORME', 'NAO_CONFORME', 'NAO_APLICAVEL');

-- CreateEnum
CREATE TYPE "GravidadeDaIrregularidade" AS ENUM ('FORMAL', 'GRAVE', 'GRAVISSIMA');

-- CreateEnum
CREATE TYPE "TipoMovimentoDaAuditoria" AS ENUM ('ABERTURA', 'ENCERRAMENTO', 'REABERTURA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'CONVENIO';
ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'PRECATORIO';
ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'CONSORCIO';
ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'OBRA';
ALTER TYPE "CadastroComCamposAdicionais" ADD VALUE 'AUDITORIA_INTERNA';

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "auditoriaId" TEXT,
ADD COLUMN     "consorcioId" TEXT,
ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "obraId" TEXT,
ADD COLUMN     "precatorioId" TEXT;

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "consorcioId" TEXT,
ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "precatorioId" TEXT;

-- AlterTable
ALTER TABLE "Liquidacao" ADD COLUMN     "medicaoId" TEXT;

-- AlterTable
ALTER TABLE "ValorDeCampoAdicional" ADD COLUMN     "auditoriaId" TEXT,
ADD COLUMN     "consorcioId" TEXT,
ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "obraId" TEXT,
ADD COLUMN     "precatorioId" TEXT;

-- CreateTable
CREATE TABLE "MedicaoDeObra" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "valorMedido" DECIMAL(18,2) NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "registroProfissional" TEXT NOT NULL,
    "aprovadaEm" TIMESTAMP(3),
    "aprovadaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MedicaoDeObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convenio" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "papelDoEnte" "PapelNoConvenio" NOT NULL,
    "partidaNome" TEXT NOT NULL,
    "partidaDocumento" VARCHAR(14) NOT NULL,
    "leiAutorizativa" TEXT NOT NULL,
    "valorRepasse" DECIMAL(18,2) NOT NULL,
    "valorContrapartida" DECIMAL(18,2) NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "diasParaPrestacaoDeContas" INTEGER NOT NULL DEFAULT 60,
    "fonteRecursoId" TEXT NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Convenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoConvenio" (
    "id" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "tipo" "TipoMovimentoConvenio" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "parcela" INTEGER,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "empenhoId" TEXT,
    "receitaArrecadadaId" TEXT,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoConvenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroConvenio" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoConvenio" NOT NULL,
    "papelDoEnte" "PapelNoConvenio" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "historicoPadrao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoteiroConvenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Precatorio" (
    "id" TEXT NOT NULL,
    "numeroProcesso" TEXT NOT NULL,
    "tribunal" TEXT NOT NULL,
    "oficioRequisitorio" TEXT,
    "beneficiarioNome" TEXT NOT NULL,
    "beneficiarioDocumento" VARCHAR(14) NOT NULL,
    "natureza" "NaturezaDoPrecatorio" NOT NULL,
    "preferencia" "PreferenciaDoPrecatorio" NOT NULL DEFAULT 'NENHUMA',
    "dataApresentacao" TIMESTAMP(3) NOT NULL,
    "exercicioDePagamento" INTEGER NOT NULL,
    "valorOriginal" DECIMAL(18,2) NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Precatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoPrecatorio" (
    "id" TEXT NOT NULL,
    "precatorioId" TEXT NOT NULL,
    "tipo" "TipoMovimentoPrecatorio" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "competencia" TIMESTAMP(3),
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "pagamentoId" TEXT,
    "lancamentoId" TEXT,
    "justificativaQuebraDeOrdem" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoPrecatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroPrecatorio" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoPrecatorio" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "historicoPadrao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoteiroPrecatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsorcioPublico" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "denominacao" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "protocoloDeIntencoes" TEXT NOT NULL,
    "leiRatificadora" TEXT NOT NULL,
    "areaDeAtuacao" TEXT NOT NULL,
    "fonteRecursoId" TEXT NOT NULL,
    "contaContabilId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConsorcioPublico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoDeRateio" (
    "id" TEXT NOT NULL,
    "consorcioId" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "valorDoEnte" DECIMAL(18,2) NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "aditivoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContratoDeRateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoConsorcio" (
    "id" TEXT NOT NULL,
    "consorcioId" TEXT NOT NULL,
    "tipo" "TipoMovimentoConsorcio" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "empenhoId" TEXT,
    "lancamentoId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoConsorcio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroConsorcio" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoConsorcio" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "historicoPadrao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoteiroConsorcio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaInterna" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "tipo" "TipoDeAuditoria" NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "responsavel" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AuditoriaInterna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDeChecklist" (
    "id" TEXT NOT NULL,
    "auditoriaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "pergunta" TEXT NOT NULL,
    "baseLegal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaDeChecklist" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "resposta" "RespostaDoChecklist" NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RespostaDeChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Irregularidade" (
    "id" TEXT NOT NULL,
    "auditoriaId" TEXT NOT NULL,
    "itemId" TEXT,
    "descricao" TEXT NOT NULL,
    "gravidade" "GravidadeDaIrregularidade" NOT NULL,
    "providencia" TEXT NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Irregularidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvidenciaDaIrregularidade" (
    "id" TEXT NOT NULL,
    "irregularidadeId" TEXT NOT NULL,
    "relato" TEXT NOT NULL,
    "dataProvidencia" TIMESTAMP(3) NOT NULL,
    "aceita" BOOLEAN,
    "motivoDaRecusa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProvidenciaDaIrregularidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDaAuditoria" (
    "id" TEXT NOT NULL,
    "auditoriaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaAuditoria" NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDaAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatorioCircunstanciado" (
    "id" TEXT NOT NULL,
    "auditoriaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "hashConteudo" VARCHAR(64) NOT NULL,
    "anexoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RelatorioCircunstanciado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicaoDeObra_contratoId_idx" ON "MedicaoDeObra"("contratoId");

-- CreateIndex
CREATE INDEX "MedicaoDeObra_periodoInicio_periodoFim_idx" ON "MedicaoDeObra"("periodoInicio", "periodoFim");

-- CreateIndex
CREATE UNIQUE INDEX "MedicaoDeObra_obraId_numero_key" ON "MedicaoDeObra"("obraId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Convenio_identificador_key" ON "Convenio"("identificador");

-- CreateIndex
CREATE INDEX "Convenio_papelDoEnte_idx" ON "Convenio"("papelDoEnte");

-- CreateIndex
CREATE INDEX "Convenio_vigenciaInicio_vigenciaFim_idx" ON "Convenio"("vigenciaInicio", "vigenciaFim");

-- CreateIndex
CREATE INDEX "Convenio_fonteRecursoId_idx" ON "Convenio"("fonteRecursoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoConvenio_lancamentoId_key" ON "MovimentoConvenio"("lancamentoId");

-- CreateIndex
CREATE INDEX "MovimentoConvenio_convenioId_tipo_idx" ON "MovimentoConvenio"("convenioId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoConvenio_dataMovimento_idx" ON "MovimentoConvenio"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoConvenio_competencia_idx" ON "MovimentoConvenio"("competencia");

-- CreateIndex
CREATE INDEX "MovimentoConvenio_empenhoId_idx" ON "MovimentoConvenio"("empenhoId");

-- CreateIndex
CREATE INDEX "MovimentoConvenio_estornoDeId_idx" ON "MovimentoConvenio"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroConvenio_tipo_papelDoEnte_key" ON "RoteiroConvenio"("tipo", "papelDoEnte");

-- CreateIndex
CREATE UNIQUE INDEX "Precatorio_numeroProcesso_key" ON "Precatorio"("numeroProcesso");

-- CreateIndex
CREATE INDEX "Precatorio_natureza_preferencia_dataApresentacao_idx" ON "Precatorio"("natureza", "preferencia", "dataApresentacao");

-- CreateIndex
CREATE INDEX "Precatorio_exercicioDePagamento_idx" ON "Precatorio"("exercicioDePagamento");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoPrecatorio_lancamentoId_key" ON "MovimentoPrecatorio"("lancamentoId");

-- CreateIndex
CREATE INDEX "MovimentoPrecatorio_precatorioId_tipo_idx" ON "MovimentoPrecatorio"("precatorioId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoPrecatorio_dataMovimento_idx" ON "MovimentoPrecatorio"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoPrecatorio_pagamentoId_idx" ON "MovimentoPrecatorio"("pagamentoId");

-- CreateIndex
CREATE INDEX "MovimentoPrecatorio_estornoDeId_idx" ON "MovimentoPrecatorio"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroPrecatorio_tipo_key" ON "RoteiroPrecatorio"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ConsorcioPublico_identificador_key" ON "ConsorcioPublico"("identificador");

-- CreateIndex
CREATE INDEX "ConsorcioPublico_fonteRecursoId_idx" ON "ConsorcioPublico"("fonteRecursoId");

-- CreateIndex
CREATE INDEX "ContratoDeRateio_consorcioId_exercicio_idx" ON "ContratoDeRateio"("consorcioId", "exercicio");

-- CreateIndex
CREATE INDEX "ContratoDeRateio_aditivoDeId_idx" ON "ContratoDeRateio"("aditivoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoConsorcio_lancamentoId_key" ON "MovimentoConsorcio"("lancamentoId");

-- CreateIndex
CREATE INDEX "MovimentoConsorcio_consorcioId_exercicio_tipo_idx" ON "MovimentoConsorcio"("consorcioId", "exercicio", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoConsorcio_dataMovimento_idx" ON "MovimentoConsorcio"("dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoConsorcio_empenhoId_idx" ON "MovimentoConsorcio"("empenhoId");

-- CreateIndex
CREATE INDEX "MovimentoConsorcio_estornoDeId_idx" ON "MovimentoConsorcio"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroConsorcio_tipo_key" ON "RoteiroConsorcio"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "AuditoriaInterna_identificador_key" ON "AuditoriaInterna"("identificador");

-- CreateIndex
CREATE INDEX "AuditoriaInterna_orgaoId_idx" ON "AuditoriaInterna"("orgaoId");

-- CreateIndex
CREATE INDEX "AuditoriaInterna_tipo_idx" ON "AuditoriaInterna"("tipo");

-- CreateIndex
CREATE INDEX "AuditoriaInterna_periodoInicio_periodoFim_idx" ON "AuditoriaInterna"("periodoInicio", "periodoFim");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDeChecklist_auditoriaId_ordem_key" ON "ItemDeChecklist"("auditoriaId", "ordem");

-- CreateIndex
CREATE INDEX "RespostaDeChecklist_itemId_criadoEm_idx" ON "RespostaDeChecklist"("itemId", "criadoEm");

-- CreateIndex
CREATE INDEX "Irregularidade_auditoriaId_gravidade_idx" ON "Irregularidade"("auditoriaId", "gravidade");

-- CreateIndex
CREATE INDEX "Irregularidade_prazo_idx" ON "Irregularidade"("prazo");

-- CreateIndex
CREATE INDEX "ProvidenciaDaIrregularidade_irregularidadeId_criadoEm_idx" ON "ProvidenciaDaIrregularidade"("irregularidadeId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoDaAuditoria_auditoriaId_criadoEm_idx" ON "MovimentoDaAuditoria"("auditoriaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioCircunstanciado_anexoId_key" ON "RelatorioCircunstanciado"("anexoId");

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioCircunstanciado_auditoriaId_versao_key" ON "RelatorioCircunstanciado"("auditoriaId", "versao");

-- CreateIndex
CREATE INDEX "Anexo_convenioId_idx" ON "Anexo"("convenioId");

-- CreateIndex
CREATE INDEX "Anexo_precatorioId_idx" ON "Anexo"("precatorioId");

-- CreateIndex
CREATE INDEX "Anexo_consorcioId_idx" ON "Anexo"("consorcioId");

-- CreateIndex
CREATE INDEX "Anexo_obraId_idx" ON "Anexo"("obraId");

-- CreateIndex
CREATE INDEX "Anexo_auditoriaId_idx" ON "Anexo"("auditoriaId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_convenioId_idx" ON "ValorDeCampoAdicional"("convenioId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_precatorioId_idx" ON "ValorDeCampoAdicional"("precatorioId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_consorcioId_idx" ON "ValorDeCampoAdicional"("consorcioId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_obraId_idx" ON "ValorDeCampoAdicional"("obraId");

-- CreateIndex
CREATE INDEX "ValorDeCampoAdicional_auditoriaId_idx" ON "ValorDeCampoAdicional"("auditoriaId");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_precatorioId_fkey" FOREIGN KEY ("precatorioId") REFERENCES "Precatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "ConsorcioPublico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDeObra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoDeObra" ADD CONSTRAINT "MedicaoDeObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoDeObra" ADD CONSTRAINT "MedicaoDeObra_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_precatorioId_fkey" FOREIGN KEY ("precatorioId") REFERENCES "Precatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "ConsorcioPublico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_precatorioId_fkey" FOREIGN KEY ("precatorioId") REFERENCES "Precatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "ConsorcioPublico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorDeCampoAdicional" ADD CONSTRAINT "ValorDeCampoAdicional_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convenio" ADD CONSTRAINT "Convenio_fonteRecursoId_fkey" FOREIGN KEY ("fonteRecursoId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convenio" ADD CONSTRAINT "Convenio_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConvenio" ADD CONSTRAINT "MovimentoConvenio_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConvenio" ADD CONSTRAINT "MovimentoConvenio_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConvenio" ADD CONSTRAINT "MovimentoConvenio_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConvenio" ADD CONSTRAINT "MovimentoConvenio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConvenio" ADD CONSTRAINT "MovimentoConvenio_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoConvenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroConvenio" ADD CONSTRAINT "RoteiroConvenio_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroConvenio" ADD CONSTRAINT "RoteiroConvenio_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precatorio" ADD CONSTRAINT "Precatorio_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPrecatorio" ADD CONSTRAINT "MovimentoPrecatorio_precatorioId_fkey" FOREIGN KEY ("precatorioId") REFERENCES "Precatorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPrecatorio" ADD CONSTRAINT "MovimentoPrecatorio_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPrecatorio" ADD CONSTRAINT "MovimentoPrecatorio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPrecatorio" ADD CONSTRAINT "MovimentoPrecatorio_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoPrecatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroPrecatorio" ADD CONSTRAINT "RoteiroPrecatorio_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroPrecatorio" ADD CONSTRAINT "RoteiroPrecatorio_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorcioPublico" ADD CONSTRAINT "ConsorcioPublico_fonteRecursoId_fkey" FOREIGN KEY ("fonteRecursoId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorcioPublico" ADD CONSTRAINT "ConsorcioPublico_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoDeRateio" ADD CONSTRAINT "ContratoDeRateio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "ConsorcioPublico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoDeRateio" ADD CONSTRAINT "ContratoDeRateio_aditivoDeId_fkey" FOREIGN KEY ("aditivoDeId") REFERENCES "ContratoDeRateio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConsorcio" ADD CONSTRAINT "MovimentoConsorcio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "ConsorcioPublico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConsorcio" ADD CONSTRAINT "MovimentoConsorcio_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConsorcio" ADD CONSTRAINT "MovimentoConsorcio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoConsorcio" ADD CONSTRAINT "MovimentoConsorcio_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoConsorcio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroConsorcio" ADD CONSTRAINT "RoteiroConsorcio_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroConsorcio" ADD CONSTRAINT "RoteiroConsorcio_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaInterna" ADD CONSTRAINT "AuditoriaInterna_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDeChecklist" ADD CONSTRAINT "ItemDeChecklist_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaDeChecklist" ADD CONSTRAINT "RespostaDeChecklist_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDeChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Irregularidade" ADD CONSTRAINT "Irregularidade_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Irregularidade" ADD CONSTRAINT "Irregularidade_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDeChecklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvidenciaDaIrregularidade" ADD CONSTRAINT "ProvidenciaDaIrregularidade_irregularidadeId_fkey" FOREIGN KEY ("irregularidadeId") REFERENCES "Irregularidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDaAuditoria" ADD CONSTRAINT "MovimentoDaAuditoria_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioCircunstanciado" ADD CONSTRAINT "RelatorioCircunstanciado_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "AuditoriaInterna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioCircunstanciado" ADD CONSTRAINT "RelatorioCircunstanciado_anexoId_fkey" FOREIGN KEY ("anexoId") REFERENCES "Anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
