-- V11 V4.2 — a politica de publicacao de pessoal. Aditiva: dois enums, duas tabelas. Zero DROP.
--
-- ⚠️ SEM MIGRACAO DE DADOS, E ISSO E DELIBERADO. Nao se cria uma politica inicial "publicando o
-- basico": o estado de partida e NENHUMA politica, e o portal diz que a regra nao foi declarada.
-- Semear uma politica aqui equivaleria a este arquivo decidir, pelo municipio, o que da vida
-- funcional de cada servidor vira publico.

CREATE TYPE "ColunaDoDemonstrativoDePessoal" AS ENUM (
  'NOME', 'MATRICULA', 'CARGO', 'LOTACAO', 'TIPO_DE_VINCULO',
  'REGIME_PREVIDENCIARIO', 'PROVENTOS', 'DESCONTOS', 'LIQUIDO'
);
CREATE TYPE "SituacaoDaPoliticaDePessoal" AS ENUM ('RASCUNHO', 'APROVADA', 'REVOGADA');

CREATE TABLE "PoliticaDePublicacaoDePessoal" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "fundamentacaoLegal" TEXT NOT NULL,
    "situacao" "SituacaoDaPoliticaDePessoal" NOT NULL DEFAULT 'RASCUNHO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPor" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPor" TEXT,
    "motivoDaRevogacao" TEXT,
    CONSTRAINT "PoliticaDePublicacaoDePessoal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_competenciaInicio_formato"
  CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_competenciaFim_formato"
  CHECK ("competenciaFim" IS NULL OR "competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_intervalo"
  CHECK ("competenciaFim" IS NULL OR "competenciaFim" >= "competenciaInicio");
ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_versao_positiva"
  CHECK ("versao" >= 1);
-- ⚠️ APROVADA SEM APROVADOR E O DEFEITO QUE O CAMPO EXISTE PARA IMPEDIR: e a assinatura do ato
-- que autoriza expor dado pessoal. O banco recusa, e nao so o servico.
ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_aprovacao_tem_autor"
  CHECK ("situacao" <> 'APROVADA' OR ("aprovadoPor" IS NOT NULL AND "aprovadoEm" IS NOT NULL));
ALTER TABLE "PoliticaDePublicacaoDePessoal" ADD CONSTRAINT "PoliticaDePessoal_revogacao_tem_autor"
  CHECK ("situacao" <> 'REVOGADA' OR ("revogadoPor" IS NOT NULL AND "revogadoEm" IS NOT NULL AND "motivoDaRevogacao" IS NOT NULL));

CREATE UNIQUE INDEX "PoliticaDePublicacaoDePessoal_versao_key" ON "PoliticaDePublicacaoDePessoal"("versao");
CREATE INDEX "PoliticaDePublicacaoDePessoal_competenciaInicio_idx" ON "PoliticaDePublicacaoDePessoal"("competenciaInicio");
CREATE INDEX "PoliticaDePublicacaoDePessoal_situacao_idx" ON "PoliticaDePublicacaoDePessoal"("situacao");

CREATE TABLE "ColunaPublicadaDePessoal" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "coluna" "ColunaDoDemonstrativoDePessoal" NOT NULL,
    CONSTRAINT "ColunaPublicadaDePessoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ColunaPublicadaDePessoal_politicaId_coluna_key"
  ON "ColunaPublicadaDePessoal"("politicaId", "coluna");

ALTER TABLE "ColunaPublicadaDePessoal" ADD CONSTRAINT "ColunaPublicadaDePessoal_politicaId_fkey"
  FOREIGN KEY ("politicaId") REFERENCES "PoliticaDePublicacaoDePessoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
