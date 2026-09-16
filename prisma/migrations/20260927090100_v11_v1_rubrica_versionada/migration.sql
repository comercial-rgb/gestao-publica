-- V11 V1.1 — a rubrica versionada, com fórmula do ente e grafo de dependências.
-- Aditiva: dois enums, duas tabelas e uma migração de dados. Zero DROP, zero ALTER destrutivo.

CREATE TYPE "AplicabilidadeDeRegime" AS ENUM ('TODOS', 'RGPS', 'RPPS', 'ISENTO');
CREATE TYPE "SituacaoDaVersaoDaRubrica" AS ENUM ('RASCUNHO', 'APROVADA', 'REVOGADA');

CREATE TABLE "VersaoDaRubrica" (
    "id" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "competenciaInicio" VARCHAR(7) NOT NULL,
    "competenciaFim" VARCHAR(7),
    "formula" TEXT,
    "percentual" DECIMAL(7,4),
    "incideContribuicao" BOOLEAN NOT NULL,
    "incideIrrf" BOOLEAN NOT NULL,
    "proporcionalAosDias" BOOLEAN NOT NULL,
    "casasDecimais" INTEGER NOT NULL DEFAULT 2,
    "regime" "AplicabilidadeDeRegime" NOT NULL DEFAULT 'TODOS',
    "fundamentacaoLegal" TEXT NOT NULL,
    "situacao" "SituacaoDaVersaoDaRubrica" NOT NULL DEFAULT 'RASCUNHO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPor" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPor" TEXT,
    "motivoDaRevogacao" TEXT,
    CONSTRAINT "VersaoDaRubrica_pkey" PRIMARY KEY ("id")
);

-- A competência é AAAA-MM, como em toda a folha. `1900-01` é a vigência das versões nascidas da
-- migração de dados abaixo: "desde antes de qualquer competência deste sistema".
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_competenciaInicio_formato"
  CHECK ("competenciaInicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_competenciaFim_formato"
  CHECK ("competenciaFim" IS NULL OR "competenciaFim" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_intervalo"
  CHECK ("competenciaFim" IS NULL OR "competenciaFim" >= "competenciaInicio");
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_versao_positiva" CHECK ("versao" >= 1);
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_casas" CHECK ("casasDecimais" BETWEEN 0 AND 6);
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_percentual_intervalo"
  CHECK ("percentual" IS NULL OR ("percentual" >= 0 AND "percentual" <= 1));
-- ⚠️ APROVADA SEM APROVADOR É O DEFEITO QUE O CAMPO EXISTE PARA IMPEDIR. O banco recusa, e não
-- só o serviço: uma aprovação gravada por outro caminho continuaria tendo de dizer quem aprovou.
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_aprovacao_tem_autor"
  CHECK ("situacao" <> 'APROVADA' OR ("aprovadoPor" IS NOT NULL AND "aprovadoEm" IS NOT NULL));
ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_revogacao_tem_autor"
  CHECK ("situacao" <> 'REVOGADA' OR ("revogadoPor" IS NOT NULL AND "revogadoEm" IS NOT NULL AND "motivoDaRevogacao" IS NOT NULL));

CREATE UNIQUE INDEX "VersaoDaRubrica_rubricaId_versao_key" ON "VersaoDaRubrica"("rubricaId", "versao");
CREATE INDEX "VersaoDaRubrica_rubricaId_competenciaInicio_idx" ON "VersaoDaRubrica"("rubricaId", "competenciaInicio");
CREATE INDEX "VersaoDaRubrica_situacao_idx" ON "VersaoDaRubrica"("situacao");

ALTER TABLE "VersaoDaRubrica" ADD CONSTRAINT "VersaoDaRubrica_rubricaId_fkey"
  FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DependenciaDaVersaoDaRubrica" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "codigoDaDependencia" TEXT NOT NULL,
    CONSTRAINT "DependenciaDaVersaoDaRubrica_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DependenciaDaVersaoDaRubrica_versaoId_codigoDaDependencia_key"
  ON "DependenciaDaVersaoDaRubrica"("versaoId", "codigoDaDependencia");
CREATE INDEX "DependenciaDaVersaoDaRubrica_codigoDaDependencia_idx"
  ON "DependenciaDaVersaoDaRubrica"("codigoDaDependencia");

ALTER TABLE "DependenciaDaVersaoDaRubrica" ADD CONSTRAINT "DependenciaDaVersaoDaRubrica_versaoId_fkey"
  FOREIGN KEY ("versaoId") REFERENCES "VersaoDaRubrica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ MIGRAÇÃO DE DADOS ═══
-- Cada rubrica existente ganha a VERSÃO 1, APROVADA, copiando exatamente as colunas que o motor
-- lia até aqui. Sem isso, a primeira folha calculada depois desta migration não encontraria
-- versão vigente e recusaria — e toda folha já fechada deixaria de ser reproduzível.
-- A aprovação é atribuída a quem criou a rubrica: é o registro verdadeiro do que existia, e não
-- uma assinatura inventada para um servidor que não aprovou nada.
INSERT INTO "VersaoDaRubrica" (
  "id", "rubricaId", "versao", "competenciaInicio", "competenciaFim", "formula", "percentual",
  "incideContribuicao", "incideIrrf", "proporcionalAosDias", "casasDecimais", "regime",
  "fundamentacaoLegal", "situacao", "criadoEm", "criadoPor", "aprovadoEm", "aprovadoPor")
SELECT
  gen_random_uuid()::text, r."id", 1, '1900-01', NULL, NULL, r."percentual",
  r."incideContribuicao", r."incideIrrf", r."proporcionalAosDias", 2, 'TODOS',
  r."fundamentacaoLegal", 'APROVADA', r."criadoEm", r."criadoPor", r."criadoEm", r."criadoPor"
FROM "Rubrica" r;
