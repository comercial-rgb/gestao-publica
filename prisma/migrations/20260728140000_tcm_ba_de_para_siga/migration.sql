-- TCM-BA / SIGA — as tabelas de DE/PARA (conta contábil e fonte de recurso).
--
-- ⚠️ TABELAS NOVAS, SEM BACKFILL. Diferente da migration do `tribunalCodigo`, aqui
-- não há linha preexistente para preencher: o de/para nasce vazio e é POVOADO
-- pelo ente, conta a conta, quando o TCM publicar a correspondência. Um de/para
-- chutado seria pior que um vazio — o vazio BLOQUEIA a remessa e nomeia a conta
-- que falta; o chutado gera arquivo aceito apontando para a conta errada.
--
-- ⚠️ AS CONSTRAINTS VÃO AQUI, NÃO EM prisma/sql/. Aquela pasta é para o que o
-- Prisma não expressa E é reaplicável a cada rodada de teste (índices parciais,
-- idempotentes). Unicidade e CHECK de domínio são parte da DEFINIÇÃO destas
-- tabelas: nascem com elas, na mesma transação.

CREATE TABLE "DeParaContaSiga" (
    "id"            TEXT NOT NULL,
    "contaPcaspId"  TEXT NOT NULL,
    "sequencialTcm" INTEGER NOT NULL,
    "tipoContaSiga" INTEGER NOT NULL,
    "origemSaldo"   CHAR(1) NOT NULL,
    "recebeLanc"    INTEGER NOT NULL,
    "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaContaSiga_pkey" PRIMARY KEY ("id")
);

-- Uma conta do ente tem UM de/para.
CREATE UNIQUE INDEX "DeParaContaSiga_contaPcaspId_key"
  ON "DeParaContaSiga"("contaPcaspId");

-- ⚠️ O PAR (sequencial, tipo) É A IDENTIDADE DA CONTA NO TCM. Sem esta unicidade,
-- duas contas do ente poderiam apontar para a mesma conta do Tribunal e a remessa
-- levaria a conta duplicada — que o TCM recusa, sem dizer qual das duas sobra.
CREATE UNIQUE INDEX "DeParaContaSiga_sequencialTcm_tipoContaSiga_key"
  ON "DeParaContaSiga"("sequencialTcm", "tipoContaSiga");

-- Os domínios do manual v44, impostos no banco: valem inclusive para um INSERT
-- feito por fora do Prisma (um seed ad-hoc, um psql de correção), que é por onde
-- um de/para torto entraria sem passar por validação nenhuma.

-- tp_ContaContabil: 1..9 (ver o comentário do model).
ALTER TABLE "DeParaContaSiga"
  ADD CONSTRAINT "ck_depara_conta_siga_tipo"
  CHECK ("tipoContaSiga" BETWEEN 1 AND 9);

-- tp_OrigemSaldo: C=Crédito, D=Débito, M=Mista.
ALTER TABLE "DeParaContaSiga"
  ADD CONSTRAINT "ck_depara_conta_siga_origem_saldo"
  CHECK ("origemSaldo" IN ('C', 'D', 'M'));

-- cd_RecebeLanc: 1=Sim, 2=Não.
ALTER TABLE "DeParaContaSiga"
  ADD CONSTRAINT "ck_depara_conta_siga_recebe_lanc"
  CHECK ("recebeLanc" IN (1, 2));

-- nu_SequencialTC ocupa 5 bytes no layout: acima de 99999 o campo transbordaria
-- e o writer recusaria a geração. Barrar na entrada é mais barato que descobrir
-- no fechamento da competência.
ALTER TABLE "DeParaContaSiga"
  ADD CONSTRAINT "ck_depara_conta_siga_sequencial_cabe"
  CHECK ("sequencialTcm" BETWEEN 0 AND 99999);

CREATE TABLE "DeParaFonteSiga" (
    "id"             TEXT NOT NULL,
    "fonteRecursoId" TEXT NOT NULL,
    "codigoTcmBa"    INTEGER NOT NULL,
    "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeParaFonteSiga_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeParaFonteSiga_fonteRecursoId_key"
  ON "DeParaFonteSiga"("fonteRecursoId");

-- cd_FonteRecurso ocupa 4 bytes nos arquivos Dotacao e Empenho.
ALTER TABLE "DeParaFonteSiga"
  ADD CONSTRAINT "ck_depara_fonte_siga_codigo_cabe"
  CHECK ("codigoTcmBa" BETWEEN 0 AND 9999);
