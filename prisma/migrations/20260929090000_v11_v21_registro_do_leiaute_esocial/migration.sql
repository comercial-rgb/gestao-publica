-- V11 V2.1 — o registro do leiaute do eSocial. Aditiva: tres enums, tres tabelas. Zero DROP.
--
-- ⚠️ SEM SEED, E ISSO E O PONTO. O leiaute do eSocial e documento oficial da Uniao e nao esta
-- neste repositorio. Semear "S-1200" e uma lista de campos aqui seria este arquivo inventando
-- norma federal — o mesmo que `IcExigidaPorConta` se recusa a fazer com o Anexo II da MSC.
-- Vazio, nenhum evento e gerado e a tela de consistencia nomeia o que falta.

CREATE TYPE "AmbienteDoESocial" AS ENUM ('PRODUCAO', 'PRODUCAO_RESTRITA');

CREATE TYPE "OrigemDoCampoDoESocial" AS ENUM (
  'CPF_DO_TRABALHADOR', 'NOME_DO_TRABALHADOR', 'NOME_SOCIAL_DO_TRABALHADOR',
  'DATA_DE_NASCIMENTO', 'SEXO', 'NIS_DO_TRABALHADOR', 'NOME_DA_MAE', 'NOME_DO_PAI',
  'MATRICULA_DO_VINCULO', 'DATA_DE_ADMISSAO', 'TIPO_DE_VINCULO', 'REGIME_JURIDICO',
  'REGIME_PREVIDENCIARIO', 'CNPJ_DO_ENTE'
);

CREATE TYPE "ObrigatoriedadeDoCampoDoESocial" AS ENUM ('OBRIGATORIO', 'CONDICIONAL', 'FACULTATIVO');

CREATE TABLE "LeiauteDoESocial" (
    "id" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "ambiente" "AmbienteDoESocial" NOT NULL,
    "fonte" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "arquivo" TEXT NOT NULL,
    "publicadoEm" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "conferidoPor" TEXT NOT NULL,
    "conferidoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeiauteDoESocial_pkey" PRIMARY KEY ("id")
);

-- ⚠️ A IMPRESSAO DIGITAL TEM DE SER UMA IMPRESSAO DIGITAL. Um sha256 truncado ou em maiuscula
-- casaria com o de outro arquivo na comparacao seguinte e a transcricao deixaria de ser conferivel.
ALTER TABLE "LeiauteDoESocial" ADD CONSTRAINT "LeiauteDoESocial_sha256_formato"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "LeiauteDoESocial" ADD CONSTRAINT "LeiauteDoESocial_fonte_nao_vazia"
  CHECK (length(btrim("fonte")) > 0);
ALTER TABLE "LeiauteDoESocial" ADD CONSTRAINT "LeiauteDoESocial_conferidoPor_nao_vazio"
  CHECK (length(btrim("conferidoPor")) > 0);

CREATE UNIQUE INDEX "LeiauteDoESocial_versao_ambiente_sha256_key"
  ON "LeiauteDoESocial"("versao", "ambiente", "sha256");
CREATE INDEX "LeiauteDoESocial_ambiente_publicadoEm_idx"
  ON "LeiauteDoESocial"("ambiente", "publicadoEm");

CREATE TABLE "EventoDoLeiaute" (
    "id" TEXT NOT NULL,
    "leiauteId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "xsdArquivo" TEXT,
    "xsdSha256" VARCHAR(64),
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventoDoLeiaute_pkey" PRIMARY KEY ("id")
);

-- ⚠️ NOME DE XSD SEM O DIGEST DELE E UMA VALIDACAO QUE NINGUEM PODE REFAZER. Os dois juntos,
-- ou nenhum — e sem nenhum, a geracao recusa por falta de XSD, que e o estado honesto.
ALTER TABLE "EventoDoLeiaute" ADD CONSTRAINT "EventoDoLeiaute_xsd_completo"
  CHECK (("xsdArquivo" IS NULL AND "xsdSha256" IS NULL)
      OR ("xsdArquivo" IS NOT NULL AND "xsdSha256" IS NOT NULL AND "xsdSha256" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "EventoDoLeiaute" ADD CONSTRAINT "EventoDoLeiaute_intervalo"
  CHECK ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio");

CREATE UNIQUE INDEX "EventoDoLeiaute_leiauteId_codigo_key" ON "EventoDoLeiaute"("leiauteId", "codigo");
CREATE INDEX "EventoDoLeiaute_codigo_vigenciaInicio_idx" ON "EventoDoLeiaute"("codigo", "vigenciaInicio");

ALTER TABLE "EventoDoLeiaute" ADD CONSTRAINT "EventoDoLeiaute_leiauteId_fkey"
  FOREIGN KEY ("leiauteId") REFERENCES "LeiauteDoESocial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CampoDoEvento" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "origem" "OrigemDoCampoDoESocial" NOT NULL,
    "obrigatoriedade" "ObrigatoriedadeDoCampoDoESocial" NOT NULL,
    "condicao" TEXT,
    "regra" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampoDoEvento_pkey" PRIMARY KEY ("id")
);

-- ⚠️ CONDICIONAL SEM A CONDICAO TRANSCRITA NAO DIZ NADA A QUEM VAI CONFERIR. A consistencia
-- mostra a condicao ao lado da pendencia justamente porque o sistema nao a avalia; sem o texto,
-- a linha viraria "confira alguma coisa".
ALTER TABLE "CampoDoEvento" ADD CONSTRAINT "CampoDoEvento_condicional_tem_condicao"
  CHECK ("obrigatoriedade" <> 'CONDICIONAL' OR ("condicao" IS NOT NULL AND length(btrim("condicao")) > 0));
ALTER TABLE "CampoDoEvento" ADD CONSTRAINT "CampoDoEvento_intervalo"
  CHECK ("vigenciaFim" IS NULL OR "vigenciaInicio" IS NULL OR "vigenciaFim" >= "vigenciaInicio");

CREATE UNIQUE INDEX "CampoDoEvento_eventoId_caminho_key" ON "CampoDoEvento"("eventoId", "caminho");
CREATE INDEX "CampoDoEvento_eventoId_origem_idx" ON "CampoDoEvento"("eventoId", "origem");

ALTER TABLE "CampoDoEvento" ADD CONSTRAINT "CampoDoEvento_eventoId_fkey"
  FOREIGN KEY ("eventoId") REFERENCES "EventoDoLeiaute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
