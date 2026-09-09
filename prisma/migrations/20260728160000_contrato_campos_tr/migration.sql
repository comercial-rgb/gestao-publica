-- TR/CONTRATOS — os campos que a investigação classificou como COLUNA NOVA, e as
-- duas entidades que ela classificou como ENTIDADE NOVA.
--
-- ⚠️ O QUE **NÃO** ESTÁ AQUI, E POR QUÊ. Dotação orçamentária (req. 5) e notas
-- fiscais (req. 8) NÃO viraram coluna: já se alcançam por `Empenho.contratoId`
-- (m05-despesa.prisma:131) — a dotação pelo `Empenho.fichaId` (m05:114) e a NF
-- pelos campos `notaFiscal*` da Liquidacao (m05:231-236). Duplicá-las no contrato
-- criaria a segunda verdade que o cabeçalho do m11 recusa, e o dia em que as duas
-- divergissem o TCE leria a errada.

-- ── (1) OS CAMPOS DO CONTRATO ────────────────────────────────────────────────
--
-- ⚠️ TODOS NULLABLE, MENOS O ALERTA. Os contratos de Campina Grande já estão
-- cadastrados sem estes campos; um NOT NULL exigiria backfill INVENTADO, e valor
-- inventado num contrato é declaração do ente ao Tribunal.
ALTER TABLE "Contrato" ADD COLUMN "objeto" TEXT;
ALTER TABLE "Contrato" ADD COLUMN "fiscalNome" TEXT;
ALTER TABLE "Contrato" ADD COLUMN "fiscalCpf" VARCHAR(11);
ALTER TABLE "Contrato" ADD COLUMN "fiscalDesignacao" TEXT;
ALTER TABLE "Contrato" ADD COLUMN "moeda" CHAR(3);
ALTER TABLE "Contrato" ADD COLUMN "valorMensal" DECIMAL(18,2);

-- ⚠️ O ÚNICO NOT NULL: o req. 7 exige que o alerta tenha comportamento SEMPRE
-- definido. Nulo aqui significaria "alertar quando?", e a resposta prática seria
-- "nunca" — o oposto do requisito. 90 dias é o prazo usual para instruir
-- prorrogação (art. 107), e o campo é por contrato: o gestor o ajusta.
ALTER TABLE "Contrato" ADD COLUMN "diasAlertaVencimento" INTEGER NOT NULL DEFAULT 90;

-- ── (2) AS CONSTRAINTS DE DOMÍNIO — NA MIGRATION, NUNCA EM prisma/sql/ ───────
--
-- Aquela pasta é para o que o Prisma não expressa E é reaplicável a cada rodada de
-- teste (índices parciais, idempotentes). Regra de formato é parte da DEFINIÇÃO
-- da coluna: nasce com ela, na mesma transação, e vale inclusive para um INSERT
-- feito por fora do Prisma — que é por onde um dado torto entraria.

-- CPF do fiscal: 11 dígitos, só dígitos. O CHAR(11) garante o tamanho e não o
-- conteúdo — "abcdefghijk" caberia.
ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_fiscal_cpf_formato"
  CHECK ("fiscalCpf" IS NULL OR "fiscalCpf" ~ '^[0-9]{11}$');

-- Moeda: ISO 4217 — três letras MAIÚSCULAS.
ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_moeda_formato"
  CHECK ("moeda" IS NULL OR "moeda" ~ '^[A-Z]{3}$');

-- ⚠️ VALOR MENSAL NÃO NEGATIVO. Um contrato com parcela negativa não é desconto:
-- é erro de digitação que entraria no somatório da despesa continuada.
ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_valor_mensal_nao_negativo"
  CHECK ("valorMensal" IS NULL OR "valorMensal" >= 0);

-- ⚠️ O ALERTA PRECISA DE ANTECEDÊNCIA POSITIVA. Zero dispararia no dia do
-- vencimento (tarde demais para instruir prorrogação) e negativo, depois dele.
-- O teto de 3650 barra o dedo escorregado que desligaria o alerta na prática
-- (um "9999" alertaria desde a assinatura, virando ruído permanente).
ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_dias_alerta_faixa"
  CHECK ("diasAlertaVencimento" > 0 AND "diasAlertaVencimento" <= 3650);

-- ── (2b) O DOCUMENTO DO CONTRATADO, NORMALIZADO E TRANCADO ───────────────────
--
-- ⚠️ A ORDEM É O QUE TORNA ESTA ETAPA APLICÁVEL: normaliza PRIMEIRO, tranca
-- DEPOIS. Adicionar o CHECK direto quebraria a migration em qualquer base cujos
-- contratos tenham sido cadastrados com pontuação — e o erro apareceria só no
-- deploy, não aqui.
--
-- ⚠️ E POR QUE ISTO IMPORTA. `CertidaoFornecedor.contratadoDocumento` é FK LÓGICA
-- para esta coluna (não há model `Fornecedor`). Se um CNPJ vier "12.345.678/0001-99"
-- num lado e "12345678000199" no outro, eles viram DUAS empresas: a certidão fica
-- pendurada numa e a tela da outra a declara ausente. Um fornecedor com certidão
-- válida apareceria como irregular, sem erro nenhum — o tipo de defeito que só se
-- descobre quando o Tribunal pergunta.
UPDATE "Contrato"
   SET "contratadoDocumento" = regexp_replace("contratadoDocumento", '[^0-9]', '', 'g')
 WHERE "contratadoDocumento" ~ '[^0-9]';

ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_contratado_documento_formato"
  CHECK ("contratadoDocumento" ~ '^[0-9]{11}$' OR "contratadoDocumento" ~ '^[0-9]{14}$');

-- ── (3) PARECERES — entidade, porque o requisito diz "pareceres" no plural ────
CREATE TYPE "TipoParecerContrato" AS ENUM (
  'JURIDICO', 'TECNICO', 'CONTROLE_INTERNO', 'CONTABIL'
);

CREATE TABLE "ParecerContrato" (
    "id"         TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo"       "TipoParecerContrato" NOT NULL,
    "data"       TIMESTAMP(3) NOT NULL,
    "autor"      TEXT NOT NULL,
    "conclusao"  TEXT NOT NULL,
    "referencia" TEXT,
    "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor"  TEXT NOT NULL,

    CONSTRAINT "ParecerContrato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParecerContrato_contratoId_idx" ON "ParecerContrato"("contratoId");
CREATE INDEX "ParecerContrato_tipo_idx" ON "ParecerContrato"("tipo");

ALTER TABLE "ParecerContrato"
  ADD CONSTRAINT "ParecerContrato_contratoId_fkey"
  FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── (4) CERTIDÕES — do FORNECEDOR, não do contrato ───────────────────────────
--
-- ⚠️ SEM `contratoId`, e a ausência é a decisão. A certidão negativa de um CNPJ
-- vale para TODOS os contratos daquele fornecedor; pendurá-la num contrato
-- obrigaria a recadastrar a mesma certidão N vezes, e a N-ésima cópia é a que
-- alguém esquece de renovar.
--
-- A chave é o DOCUMENTO porque não existe model `Fornecedor` neste repositório:
-- o contratado é identificado inline por `Contrato.contratadoDocumento`
-- (m11-licitacoes.prisma:150). É FK LÓGICA, não declarada — quando o `Fornecedor`
-- nascer, ele herda esta tabela.
CREATE TYPE "TipoCertidaoFornecedor" AS ENUM (
  'FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'FGTS', 'TRABALHISTA', 'FALENCIA_CONCORDATA'
);

CREATE TABLE "CertidaoFornecedor" (
    "id"                  TEXT NOT NULL,
    "contratadoDocumento" TEXT NOT NULL,
    "tipo"                "TipoCertidaoFornecedor" NOT NULL,
    "numero"              TEXT NOT NULL,
    "dataEmissao"         TIMESTAMP(3) NOT NULL,
    "validade"            TIMESTAMP(3) NOT NULL,
    "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor"           TEXT NOT NULL,

    CONSTRAINT "CertidaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- ⚠️ O ÍNDICE DA CONSULTA DOMINANTE: "certidões VÁLIDAS deste fornecedor HOJE" —
-- filtra por documento, opcionalmente por tipo, e corta por validade, nessa ordem.
-- Um índice só no documento faria o Postgres ler todo o histórico do fornecedor
-- para descartar as vencidas.
CREATE INDEX "CertidaoFornecedor_documento_tipo_validade_idx"
  ON "CertidaoFornecedor"("contratadoDocumento", "tipo", "validade");
CREATE INDEX "CertidaoFornecedor_validade_idx" ON "CertidaoFornecedor"("validade");

-- Documento: CPF (11) ou CNPJ (14), só dígitos — o mesmo formato de
-- `Contrato.contratadoDocumento`, que o schema descreve como "sem máscara".
ALTER TABLE "CertidaoFornecedor"
  ADD CONSTRAINT "ck_certidao_documento_formato"
  CHECK ("contratadoDocumento" ~ '^[0-9]{11}$' OR "contratadoDocumento" ~ '^[0-9]{14}$');

-- ⚠️ VALIDADE NÃO ANTECEDE A EMISSÃO. Uma certidão que vence antes de ser emitida
-- é erro de digitação — e passaria despercebida, porque ela apareceria
-- permanentemente como "vencida", que é um estado plausível.
ALTER TABLE "CertidaoFornecedor"
  ADD CONSTRAINT "ck_certidao_validade_apos_emissao"
  CHECK ("validade" >= "dataEmissao");
