-- ============================================================================
-- ENT03a — as DUAS decisoes do fechamento do lote:
--   1. a conta bancaria admite MAIS DE UMA fonte  (TR 5.10.2.6)
--   2. a conciliacao e OBJETO DISCRETO             (TR 5.10.2.45/.46/.49/.52)
--
-- docs/adr/ADR-conta-bancaria-com-varias-fontes.md
-- docs/adr/ADR-conciliacao-como-objeto-discreto.md
--
-- Aditiva: nenhum DROP, nenhuma coluna existente alterada. `ContaBancaria.fonteId`
-- PERMANECE como a fonte padrao — a primeira linha do vinculo nasce dela.
-- ============================================================================

-- ── 1. O ROL DE FONTES DA CONTA ─────────────────────────────────────────────
CREATE TABLE "FonteDaContaBancaria" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "FonteDaContaBancaria_pkey" PRIMARY KEY ("id")
);

-- A mesma fonte nao entra duas vezes na mesma conta: o rol viraria ambiguo.
CREATE UNIQUE INDEX "FonteDaContaBancaria_contaBancariaId_fonteId_key"
    ON "FonteDaContaBancaria"("contaBancariaId", "fonteId");
CREATE INDEX "FonteDaContaBancaria_fonteId_idx" ON "FonteDaContaBancaria"("fonteId");

ALTER TABLE "FonteDaContaBancaria" ADD CONSTRAINT "FonteDaContaBancaria_contaBancariaId_fkey"
  FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FonteDaContaBancaria" ADD CONSTRAINT "FonteDaContaBancaria_fonteId_fkey"
  FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ BACKFILL: a fonte unica de hoje vira A PRIMEIRA LINHA do vinculo.
--
-- Sem isto, toda conta existente ficaria com rol VAZIO e o guard do movimento
-- recusaria TODA movimentacao no dia seguinte a migration — um "aditivo" que
-- quebra o sistema em producao. `gen_random_uuid` porque o id e TEXT e o cuid()
-- e do lado da aplicacao.
--
-- `criadoPor` = 'MIGRACAO': quem criou o vinculo foi a migration, e nao um
-- operador. Carimbar um usuario aqui seria atribuir a alguem uma decisao que
-- ninguem tomou.
INSERT INTO "FonteDaContaBancaria" ("id", "contaBancariaId", "fonteId", "criadoPor")
SELECT gen_random_uuid()::text, c."id", c."fonteId", 'MIGRACAO'
  FROM "ContaBancaria" c;

-- ── 2. A CONCILIACAO COMO OBJETO DISCRETO ───────────────────────────────────
CREATE TYPE "TipoMovimentoDaConciliacao" AS ENUM ('ABRIR', 'ENCERRAR');

CREATE TABLE "ConciliacaoBancaria" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "anteriorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ConciliacaoBancaria_pkey" PRIMARY KEY ("id")
);

-- Um periodo por conta: duas conciliacoes do mesmo mes na mesma conta seriam
-- duas verdades sobre o mesmo fechamento.
CREATE UNIQUE INDEX "ConciliacaoBancaria_contaBancariaId_periodoInicio_key"
    ON "ConciliacaoBancaria"("contaBancariaId", "periodoInicio");
-- ⚠️ E CADA CONCILIACAO E SUCESSORA DE NO MAXIMO UMA. Sem este unico, duas
-- conciliacoes poderiam apontar para a mesma anterior e as duas herdariam o mesmo
-- conjunto nao resolvido — a pendencia apareceria em dois periodos ao mesmo tempo.
CREATE UNIQUE INDEX "ConciliacaoBancaria_anteriorId_key"
    ON "ConciliacaoBancaria"("anteriorId");
CREATE INDEX "ConciliacaoBancaria_contaBancariaId_periodoFim_idx"
    ON "ConciliacaoBancaria"("contaBancariaId", "periodoFim");

ALTER TABLE "ConciliacaoBancaria" ADD CONSTRAINT "ConciliacaoBancaria_contaBancariaId_fkey"
  FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConciliacaoBancaria" ADD CONSTRAINT "ConciliacaoBancaria_anteriorId_fkey"
  FOREIGN KEY ("anteriorId") REFERENCES "ConciliacaoBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "ENCERRADA" e DERIVADO da existencia do movimento — nao ha coluna de estado.
CREATE TABLE "MovimentoDaConciliacao" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDaConciliacao" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "MovimentoDaConciliacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MovimentoDaConciliacao_conciliacaoId_criadoEm_idx"
    ON "MovimentoDaConciliacao"("conciliacaoId", "criadoEm");
ALTER TABLE "MovimentoDaConciliacao" ADD CONSTRAINT "MovimentoDaConciliacao_conciliacaoId_fkey"
  FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ UM ENCERRAMENTO POR CONCILIACAO, NO BANCO. Duas requisicoes simultaneas de
-- encerrar leriam ambas "ainda aberta" e gravariam as duas — e "quem encerrou?"
-- passaria a ter duas respostas. Indice unico PARCIAL: ABRIR pode repetir (a
-- reabertura nao existe, mas o modelo nao precisa proibi-la aqui).
CREATE UNIQUE INDEX "uq_encerramento_da_conciliacao_unico"
    ON "MovimentoDaConciliacao"("conciliacaoId") WHERE "tipo" = 'ENCERRAR';

-- PENDENCIA MANUAL — decisao registrada, NAO fato. Nao cria lancamento.
CREATE TABLE "PendenciaManualDeConciliacao" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "natureza" "NaturezaLancamentoExtrato" NOT NULL,
    "resolveDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "PendenciaManualDeConciliacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PendenciaManualDeConciliacao_conciliacaoId_idx"
    ON "PendenciaManualDeConciliacao"("conciliacaoId");
-- Uma resolucao por pendencia: duas resolveriam a mesma coisa duas vezes.
CREATE UNIQUE INDEX "PendenciaManualDeConciliacao_resolveDeId_key"
    ON "PendenciaManualDeConciliacao"("resolveDeId");
ALTER TABLE "PendenciaManualDeConciliacao" ADD CONSTRAINT "PendenciaManualDeConciliacao_conciliacaoId_fkey"
  FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PendenciaManualDeConciliacao" ADD CONSTRAINT "PendenciaManualDeConciliacao_resolveDeId_fkey"
  FOREIGN KEY ("resolveDeId") REFERENCES "PendenciaManualDeConciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- POR QUE UMA PENDENCIA DERIVADA PERMANECE EM ABERTO.
CREATE TABLE "JustificativaDePendencia" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "lado" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "JustificativaDePendencia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JustificativaDePendencia_conciliacaoId_lado_referencia_key"
    ON "JustificativaDePendencia"("conciliacaoId", "lado", "referencia");
ALTER TABLE "JustificativaDePendencia" ADD CONSTRAINT "JustificativaDePendencia_conciliacaoId_fkey"
  FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
