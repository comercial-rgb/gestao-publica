-- V10 T2 (N5) — M34 B2: o lançamento tributário, a constituição do crédito e a certidão.
-- Aditiva: cinco enums, oito tabelas, seis valores no enum de ações. Zero DROP, zero backfill,
-- zero alteração de coluna existente.
--
-- ⚠️ O CRÉDITO CANÔNICO NÃO NASCE AQUI. Ele é `ReceitaReconhecida` (M04), que já existe, já tem
-- roteiro contábil por origem, já tem vínculo com a arrecadação e já reservou, em 2026, a chave
-- `referenciaExterna @unique` para "a integração tributária, que virá em lote". É esta.
-- `ConstituicaoDoLancamento` é a PONTE 1-1 entre a preparação e esse crédito — não um segundo
-- ledger.
--
-- ⚠️ AS DATAS DE DOMÍNIO SÃO DIA CIVIL DO ENTE, em VARCHAR(10) "AAAA-MM-DD": fato gerador e
-- vencimento. Elas ordenam igual à ordem cronológica e não têm fuso para errar. `criadoEm` e
-- `emitidaEm` continuam TIMESTAMP — são instantes, não dias.
--
-- ⚠️ A NATUREZA E A FONTE SÃO DO LOTE, declaradas pelo ente. Não há padrão no código: cravar a
-- classificação orçamentária do IPTU de um município seria inventar norma dentro de um `if`.

-- CreateEnum
CREATE TYPE "SituacaoDoLancamentoTributario" AS ENUM ('PREPARADO', 'CONSTITUIDO', 'CANCELADO', 'RETIFICADO');

-- CreateEnum
CREATE TYPE "TipoDeCorrecaoDoLancamento" AS ENUM ('RETIFICACAO', 'CANCELAMENTO');

-- CreateEnum
CREATE TYPE "TipoDeCertidao" AS ENUM ('NEGATIVA', 'POSITIVA', 'POSITIVA_COM_EFEITO_DE_NEGATIVA');

-- CreateEnum
CREATE TYPE "SituacaoDaSolicitacaoDeCertidao" AS ENUM ('EM_ANALISE', 'EMITIDA', 'INDEFERIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SituacaoDaBaseConsultada" AS ENUM ('SEM_PENDENCIA', 'COM_PENDENCIA', 'INDISPONIVEL', 'FORA_DO_ALCANCE');

-- CreateTable
CREATE TABLE "LoteDeLancamentoTributario" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tributo" "TributoMunicipal" NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fatoGerador" VARCHAR(10) NOT NULL,
    "descricao" TEXT NOT NULL,
    "naturezaCodigo" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LoteDeLancamentoTributario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoTributario" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "versaoDoImovelId" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "tributo" "TributoMunicipal" NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fatoGerador" VARCHAR(10) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "memoria" JSONB NOT NULL,
    "memoriaSha256" VARCHAR(64) NOT NULL,
    "inconsistencias" JSONB NOT NULL,
    "situacao" "SituacaoDoLancamentoTributario" NOT NULL DEFAULT 'PREPARADO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "LancamentoTributario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsavelPeloLancamento" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "papel" "PapelNoImovel" NOT NULL,
    "fracao" DECIMAL(9,6) NOT NULL,
    "valorProporcional" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ResponsavelPeloLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VencimentoDoLancamento" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" VARCHAR(10) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "VencimentoDoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstituicaoDoLancamento" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "reconhecimentoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConstituicaoDoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrecaoDoLancamento" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "tipo" "TipoDeCorrecaoDoLancamento" NOT NULL,
    "motivo" TEXT NOT NULL,
    "substitutoId" TEXT,
    "cancelamentoDeReconhecimentoId" TEXT,
    "chave" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CorrecaoDoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoDeCertidao" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "imovelId" TEXT,
    "situacao" "SituacaoDaSolicitacaoDeCertidao" NOT NULL DEFAULT 'EM_ANALISE',
    "tipo" "TipoDeCertidao",
    "chaveDeAutenticidade" VARCHAR(64) NOT NULL,
    "validadeAte" VARCHAR(10),
    "pendencia" TEXT,
    "motivo" TEXT,
    "emissao" JSONB,
    "emissaoSha256" VARCHAR(64),
    "modeloDaEmissao" VARCHAR(40),
    "emitidaEm" TIMESTAMP(3),
    "emitidaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "SolicitacaoDeCertidao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseConsultadaNaCertidao" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "base" VARCHAR(60) NOT NULL,
    "situacao" "SituacaoDaBaseConsultada" NOT NULL,
    "detalhe" TEXT NOT NULL,
    "pendencias" INTEGER,

    CONSTRAINT "BaseConsultadaNaCertidao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoteDeLancamentoTributario_numero_key" ON "LoteDeLancamentoTributario"("numero");

-- CreateIndex
CREATE INDEX "LoteDeLancamentoTributario_tributo_exercicio_idx" ON "LoteDeLancamentoTributario"("tributo", "exercicio");

-- CreateIndex
CREATE INDEX "LancamentoTributario_imovelId_exercicio_idx" ON "LancamentoTributario"("imovelId", "exercicio");

-- CreateIndex
CREATE INDEX "LancamentoTributario_situacao_idx" ON "LancamentoTributario"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "LancamentoTributario_loteId_imovelId_key" ON "LancamentoTributario"("loteId", "imovelId");

-- CreateIndex
CREATE INDEX "ResponsavelPeloLancamento_pessoaId_idx" ON "ResponsavelPeloLancamento"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsavelPeloLancamento_lancamentoId_pessoaId_papel_key" ON "ResponsavelPeloLancamento"("lancamentoId", "pessoaId", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "VencimentoDoLancamento_lancamentoId_numero_key" ON "VencimentoDoLancamento"("lancamentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ConstituicaoDoLancamento_lancamentoId_key" ON "ConstituicaoDoLancamento"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstituicaoDoLancamento_reconhecimentoId_key" ON "ConstituicaoDoLancamento"("reconhecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstituicaoDoLancamento_chave_key" ON "ConstituicaoDoLancamento"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "CorrecaoDoLancamento_substitutoId_key" ON "CorrecaoDoLancamento"("substitutoId");

-- CreateIndex
CREATE UNIQUE INDEX "CorrecaoDoLancamento_cancelamentoDeReconhecimentoId_key" ON "CorrecaoDoLancamento"("cancelamentoDeReconhecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "CorrecaoDoLancamento_chave_key" ON "CorrecaoDoLancamento"("chave");

-- CreateIndex
CREATE INDEX "CorrecaoDoLancamento_lancamentoId_idx" ON "CorrecaoDoLancamento"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoDeCertidao_protocolo_key" ON "SolicitacaoDeCertidao"("protocolo");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoDeCertidao_chaveDeAutenticidade_key" ON "SolicitacaoDeCertidao"("chaveDeAutenticidade");

-- CreateIndex
CREATE INDEX "SolicitacaoDeCertidao_pessoaId_criadoEm_idx" ON "SolicitacaoDeCertidao"("pessoaId", "criadoEm");

-- CreateIndex
CREATE INDEX "SolicitacaoDeCertidao_situacao_idx" ON "SolicitacaoDeCertidao"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "BaseConsultadaNaCertidao_solicitacaoId_base_key" ON "BaseConsultadaNaCertidao"("solicitacaoId", "base");

-- AddForeignKey
ALTER TABLE "LoteDeLancamentoTributario" ADD CONSTRAINT "LoteDeLancamentoTributario_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoTributario" ADD CONSTRAINT "LancamentoTributario_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteDeLancamentoTributario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoTributario" ADD CONSTRAINT "LancamentoTributario_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoTributario" ADD CONSTRAINT "LancamentoTributario_versaoDoImovelId_fkey" FOREIGN KEY ("versaoDoImovelId") REFERENCES "VersaoDoImovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoTributario" ADD CONSTRAINT "LancamentoTributario_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "TabelaDeParametrosTributarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsavelPeloLancamento" ADD CONSTRAINT "ResponsavelPeloLancamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoTributario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsavelPeloLancamento" ADD CONSTRAINT "ResponsavelPeloLancamento_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VencimentoDoLancamento" ADD CONSTRAINT "VencimentoDoLancamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoTributario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituicaoDoLancamento" ADD CONSTRAINT "ConstituicaoDoLancamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoTributario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituicaoDoLancamento" ADD CONSTRAINT "ConstituicaoDoLancamento_reconhecimentoId_fkey" FOREIGN KEY ("reconhecimentoId") REFERENCES "ReceitaReconhecida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoDoLancamento" ADD CONSTRAINT "CorrecaoDoLancamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoTributario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoDoLancamento" ADD CONSTRAINT "CorrecaoDoLancamento_substitutoId_fkey" FOREIGN KEY ("substitutoId") REFERENCES "LancamentoTributario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoDoLancamento" ADD CONSTRAINT "CorrecaoDoLancamento_cancelamentoDeReconhecimentoId_fkey" FOREIGN KEY ("cancelamentoDeReconhecimentoId") REFERENCES "CancelamentoDeReconhecimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeCertidao" ADD CONSTRAINT "SolicitacaoDeCertidao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeCertidao" ADD CONSTRAINT "SolicitacaoDeCertidao_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseConsultadaNaCertidao" ADD CONSTRAINT "BaseConsultadaNaCertidao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoDeCertidao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ⚠️ A CONFIGURAÇÃO DA CERTIDÃO (validade, fundamento, observação), versionada por vigência.
-- Sem ela, a EMISSÃO é recusada: "90 dias" é o prazo de muitos municípios e não é o de todos,
-- e cravá-lo no código seria inventar norma de um ente que não a declarou. O pedido e a
-- análise funcionam sem esta tabela — o que fica impedido é emitir.
-- CreateTable
CREATE TABLE "VersaoDaConfiguracaoDaCertidao" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "vigenciaInicio" VARCHAR(10) NOT NULL,
    "validadeEmDias" INTEGER NOT NULL,
    "fundamento" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDaConfiguracaoDaCertidao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDaConfiguracaoDaCertidao_versao_key" ON "VersaoDaConfiguracaoDaCertidao"("versao");

