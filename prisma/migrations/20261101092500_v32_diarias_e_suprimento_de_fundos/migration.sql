-- V32 — diárias e suprimento de fundos: a concessão, a prestação de contas e a decisão (append-only).
CREATE TYPE "EspecieDeAdiantamento" AS ENUM ('DIARIA', 'SUPRIMENTO_DE_FUNDOS');

CREATE TABLE "ConcessaoDeAdiantamento" (
    "id" TEXT NOT NULL,
    "especie" "EspecieDeAdiantamento" NOT NULL,
    "numero" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,
    "beneficiarioNome" TEXT NOT NULL,
    "beneficiarioDocumento" VARCHAR(14) NOT NULL,
    "cargoOuFuncao" TEXT,
    "finalidade" TEXT NOT NULL,
    "destino" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "quantidadeDeDiarias" DECIMAL(6,1),
    "valorUnitario" DECIMAL(18,2),
    "valor" DECIMAL(18,2) NOT NULL,
    "atoAutorizativo" TEXT NOT NULL,
    "prazoDePrestacao" TIMESTAMP(3) NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ConcessaoDeAdiantamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrestacaoDeContasDoAdiantamento" (
    "id" TEXT NOT NULL,
    "concessaoId" TEXT NOT NULL,
    "valorComprovado" DECIMAL(18,2) NOT NULL,
    "valorDevolvido" DECIMAL(18,2) NOT NULL,
    "relatorio" TEXT NOT NULL,
    "apresentadaEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "PrestacaoDeContasDoAdiantamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisaoDaPrestacaoDoAdiantamento" (
    "id" TEXT NOT NULL,
    "prestacaoId" TEXT NOT NULL,
    "aprovada" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DecisaoDaPrestacaoDoAdiantamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConcessaoDeAdiantamento_lancamentoId_key" ON "ConcessaoDeAdiantamento"("lancamentoId");
CREATE INDEX "ConcessaoDeAdiantamento_empenhoId_idx" ON "ConcessaoDeAdiantamento"("empenhoId");
CREATE INDEX "ConcessaoDeAdiantamento_beneficiarioDocumento_idx" ON "ConcessaoDeAdiantamento"("beneficiarioDocumento");
CREATE UNIQUE INDEX "ConcessaoDeAdiantamento_especie_numero_key" ON "ConcessaoDeAdiantamento"("especie", "numero");
CREATE INDEX "PrestacaoDeContasDoAdiantamento_concessaoId_idx" ON "PrestacaoDeContasDoAdiantamento"("concessaoId");
CREATE UNIQUE INDEX "DecisaoDaPrestacaoDoAdiantamento_prestacaoId_key" ON "DecisaoDaPrestacaoDoAdiantamento"("prestacaoId");
CREATE UNIQUE INDEX "DecisaoDaPrestacaoDoAdiantamento_lancamentoId_key" ON "DecisaoDaPrestacaoDoAdiantamento"("lancamentoId");

ALTER TABLE "ConcessaoDeAdiantamento" ADD CONSTRAINT "ConcessaoDeAdiantamento_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrestacaoDeContasDoAdiantamento" ADD CONSTRAINT "PrestacaoDeContasDoAdiantamento_concessaoId_fkey" FOREIGN KEY ("concessaoId") REFERENCES "ConcessaoDeAdiantamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisaoDaPrestacaoDoAdiantamento" ADD CONSTRAINT "DecisaoDaPrestacaoDoAdiantamento_prestacaoId_fkey" FOREIGN KEY ("prestacaoId") REFERENCES "PrestacaoDeContasDoAdiantamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
