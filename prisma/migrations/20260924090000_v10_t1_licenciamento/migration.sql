-- V10 T1 (N6.1) — o contrato comercial e a habilitação de módulos desta implantação.
-- Aditiva: três enums, três tabelas, zero DROP, zero backfill, zero alteração de coluna existente.
--
-- ⚠️ A VIGÊNCIA É TEXTO "AAAA-MM-DD" (dia civil do ente), e não TIMESTAMP. Ver a nota do
-- schema: "AAAA-MM-DD" ordena igual à ordem cronológica e não tem fuso para errar.
--
-- ⚠️ O UNIQUE de "EventoDeLicenciamento"."chave" É A IDEMPOTÊNCIA (invariante 5): repetir a
-- mesma operação colide e o serviço responde "já aplicado", em vez de gravar dois eventos.
--
-- ⚠️ "enteId" NÃO tem FK para "EnteConfig", e é decisão declarada: o cadastro fiscal do ente é
-- semeado DEPOIS da instalação (a identidade pública já prevê "ente não semeado"), e uma FK
-- tornaria impossível licenciar a instalação antes de alguém preencher o código do IBGE.

CREATE TYPE "ModuloComercial" AS ENUM (
    'PLATAFORMA',
    'NUCLEO_CONTABIL',
    'TRIBUTOS_E_ARRECADACAO',
    'PATRIMONIO_E_ALMOXARIFADO',
    'COMPRAS_E_CONTRATOS',
    'PESSOAL_E_FOLHA',
    'ATENDIMENTO_AO_CIDADAO',
    'TRANSPARENCIA_E_CONTROLE',
    'INTEGRACOES_E_PRESTACAO_DE_CONTAS'
);

CREATE TYPE "SituacaoDoContratoComercial" AS ENUM ('ATIVO', 'ENCERRADO');

CREATE TYPE "TipoDeEventoDeLicenciamento" AS ENUM (
    'CONTRATO_REGISTRADO',
    'CONTRATO_ENCERRADO',
    'MODULO_HABILITADO',
    'VIGENCIA_PROGRAMADA',
    'MODULO_SUSPENSO',
    'MODULO_REATIVADO'
);

CREATE TABLE "ContratoComercial" (
    "id" TEXT NOT NULL,
    "enteId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "situacao" "SituacaoDoContratoComercial" NOT NULL DEFAULT 'ATIVO',
    "inicio" VARCHAR(10) NOT NULL,
    "fim" VARCHAR(10),
    "observacao" TEXT,
    "demonstracao" BOOLEAN NOT NULL DEFAULT false,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoComercial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContratoComercial_numero_key" ON "ContratoComercial"("numero");
CREATE INDEX "ContratoComercial_enteId_situacao_idx" ON "ContratoComercial"("enteId", "situacao");

CREATE TABLE "HabilitacaoDeModulo" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "modulo" "ModuloComercial" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "inicio" VARCHAR(10) NOT NULL,
    "fim" VARCHAR(10),
    "motivo" TEXT NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabilitacaoDeModulo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HabilitacaoDeModulo_contratoId_modulo_key" ON "HabilitacaoDeModulo"("contratoId", "modulo");

CREATE TABLE "EventoDeLicenciamento" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "modulo" "ModuloComercial",
    "tipo" "TipoDeEventoDeLicenciamento" NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL,
    "vigenciaInicio" VARCHAR(10),
    "vigenciaFim" VARCHAR(10),
    "chave" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoDeLicenciamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventoDeLicenciamento_chave_key" ON "EventoDeLicenciamento"("chave");
CREATE INDEX "EventoDeLicenciamento_contratoId_criadoEm_idx" ON "EventoDeLicenciamento"("contratoId", "criadoEm");

ALTER TABLE "HabilitacaoDeModulo" ADD CONSTRAINT "HabilitacaoDeModulo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoComercial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventoDeLicenciamento" ADD CONSTRAINT "EventoDeLicenciamento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoComercial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
