-- V11 V8.9 — O EIXO DA DOTAÇÃO ADICIONAL (`DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`)
--
-- `5.2.2.1.2` (por tipo de crédito) e `5.2.2.1.3` (por fonte) são IRMÃS sob `5.2.2.1 DOTAÇÃO
-- ORÇAMENTÁRIA` e descrevem o MESMO crédito por eixos diferentes. O sistema só lançava na `.2`, e
-- a `.3` ficava vazia em todo demonstrativo que a lesse. Qual das duas o ente adota é decisão
-- contábil dele — e não havia onde tomá-la.
--
-- ADITIVA: dois modelos novos e um tipo novo. Nada muda de lugar, e a ausência de política vale
-- como POR_TIPO_DE_CREDITO — o comportamento que todo banco existente já tem.
CREATE TYPE "EixoDaDotacaoAdicional" AS ENUM ('POR_TIPO_DE_CREDITO', 'POR_FONTE');

CREATE TABLE "PoliticaDaDotacaoAdicional" (
    "id" TEXT NOT NULL,
    "eixo" "EixoDaDotacaoAdicional" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "PoliticaDaDotacaoAdicional_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoliticaDaDotacaoAdicional_versao_key" ON "PoliticaDaDotacaoAdicional"("versao");
CREATE INDEX "PoliticaDaDotacaoAdicional_versao_idx" ON "PoliticaDaDotacaoAdicional"("versao");

-- ⚠️ O FUNDAMENTO TEM PISO, E O PISO É DO BANCO TAMBÉM. "porque sim" tem dez caracteres e
-- passaria por qualquer `min(10)` de aplicação — foi medido na V8.3, com essas palavras.
ALTER TABLE "PoliticaDaDotacaoAdicional" ADD CONSTRAINT "ck_politica_dotacao_fundamento_nao_vazio"
    CHECK (length(btrim("fundamento")) >= 20);
ALTER TABLE "PoliticaDaDotacaoAdicional" ADD CONSTRAINT "ck_politica_dotacao_versao_positiva"
    CHECK ("versao" >= 1);

CREATE TABLE "RoteiroDaDotacaoPorFonte" (
    "id" TEXT NOT NULL,
    "origem" "OrigemRecurso" NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "fundamento" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RoteiroDaDotacaoPorFonte_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoteiroDaDotacaoPorFonte_origem_versao_key" ON "RoteiroDaDotacaoPorFonte"("origem", "versao");
CREATE INDEX "RoteiroDaDotacaoPorFonte_origem_versao_idx" ON "RoteiroDaDotacaoPorFonte"("origem", "versao");

ALTER TABLE "RoteiroDaDotacaoPorFonte" ADD CONSTRAINT "RoteiroDaDotacaoPorFonte_contaDebitoId_fkey"
    FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoteiroDaDotacaoPorFonte" ADD CONSTRAINT "RoteiroDaDotacaoPorFonte_contaCreditoId_fkey"
    FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ DÉBITO E CRÉDITO NÃO PODEM SER A MESMA CONTA. Um lançamento assim move zero e mesmo assim
-- balanceia: passa por todo guard e não escritura nada. É o erro de digitação mais fácil daqui.
ALTER TABLE "RoteiroDaDotacaoPorFonte" ADD CONSTRAINT "ck_roteiro_por_fonte_contas_distintas"
    CHECK ("contaDebitoId" <> "contaCreditoId");
ALTER TABLE "RoteiroDaDotacaoPorFonte" ADD CONSTRAINT "ck_roteiro_por_fonte_versao_positiva"
    CHECK ("versao" >= 1);
