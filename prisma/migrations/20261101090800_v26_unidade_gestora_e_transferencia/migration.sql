-- V26 (ordem, item 2.9) — unidades gestoras do ente (cadastro do TCE-PB) e transferências financeiras entre elas.
-- Aditiva.

-- CreateEnum
CREATE TYPE "TipoDeTransferenciaEntreUgs" AS ENUM ('DUODECIMO', 'APORTE_DESPESAS_ADMINISTRATIVAS', 'APORTE_INSUFICIENCIA_FINANCEIRA', 'APORTE_BENEFICIOS_PREVIDENCIARIOS', 'OUTROS_APORTES', 'INVESTIMENTOS_OU_RESGATES', 'DEVOLUCAO_DE_RECURSOS', 'TRANSFERENCIA_INDIRETA');

-- CreateTable
CREATE TABLE "UnidadeGestora" (
    "id" TEXT NOT NULL,
    "codigoTce" VARCHAR(6) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "cnpj" VARCHAR(14),
    "naturezaJuridica" "NaturezaJuridicaDaUnidade" NOT NULL,
    "entidadeContabilId" TEXT,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "UnidadeGestora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncerramentoDaUnidadeGestora" (
    "id" TEXT NOT NULL,
    "ugId" TEXT NOT NULL,
    "vigenteAte" TIMESTAMP(3) NOT NULL,
    "ato" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EncerramentoDaUnidadeGestora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContabilizacaoDaTransferenciaEntreUgs" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeTransferenciaEntreUgs" NOT NULL,
    "contaConcedidaId" TEXT NOT NULL,
    "contaRecebidaId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContabilizacaoDaTransferenciaEntreUgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaEntreUgs" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeTransferenciaEntreUgs" NOT NULL,
    "ugOrigemId" TEXT NOT NULL,
    "ugDestinoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "contaOrigemId" TEXT,
    "contaDestinoId" TEXT,
    "vinculo" TEXT NOT NULL,
    "contabilizacaoId" TEXT NOT NULL,
    "lancamentoConcedidaId" TEXT,
    "lancamentoRecebidaId" TEXT,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "TransferenciaEntreUgs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeGestora_codigoTce_key" ON "UnidadeGestora"("codigoTce");

-- CreateIndex
CREATE INDEX "UnidadeGestora_entidadeContabilId_idx" ON "UnidadeGestora"("entidadeContabilId");

-- CreateIndex
CREATE UNIQUE INDEX "EncerramentoDaUnidadeGestora_ugId_key" ON "EncerramentoDaUnidadeGestora"("ugId");

-- CreateIndex
CREATE UNIQUE INDEX "ContabilizacaoDaTransferenciaEntreUgs_tipo_vigenteDesde_key" ON "ContabilizacaoDaTransferenciaEntreUgs"("tipo", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaEntreUgs_lancamentoConcedidaId_key" ON "TransferenciaEntreUgs"("lancamentoConcedidaId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaEntreUgs_lancamentoRecebidaId_key" ON "TransferenciaEntreUgs"("lancamentoRecebidaId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaEntreUgs_estornoDeId_key" ON "TransferenciaEntreUgs"("estornoDeId");

-- CreateIndex
CREATE INDEX "TransferenciaEntreUgs_data_idx" ON "TransferenciaEntreUgs"("data");

-- CreateIndex
CREATE INDEX "TransferenciaEntreUgs_ugOrigemId_idx" ON "TransferenciaEntreUgs"("ugOrigemId");

-- CreateIndex
CREATE INDEX "TransferenciaEntreUgs_ugDestinoId_idx" ON "TransferenciaEntreUgs"("ugDestinoId");

-- AddForeignKey
ALTER TABLE "UnidadeGestora" ADD CONSTRAINT "UnidadeGestora_entidadeContabilId_fkey" FOREIGN KEY ("entidadeContabilId") REFERENCES "EntidadeContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncerramentoDaUnidadeGestora" ADD CONSTRAINT "EncerramentoDaUnidadeGestora_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContabilizacaoDaTransferenciaEntreUgs" ADD CONSTRAINT "ContabilizacaoDaTransferenciaEntreUgs_contaConcedidaId_fkey" FOREIGN KEY ("contaConcedidaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContabilizacaoDaTransferenciaEntreUgs" ADD CONSTRAINT "ContabilizacaoDaTransferenciaEntreUgs_contaRecebidaId_fkey" FOREIGN KEY ("contaRecebidaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_ugOrigemId_fkey" FOREIGN KEY ("ugOrigemId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_ugDestinoId_fkey" FOREIGN KEY ("ugDestinoId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_contaOrigemId_fkey" FOREIGN KEY ("contaOrigemId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_contabilizacaoId_fkey" FOREIGN KEY ("contabilizacaoId") REFERENCES "ContabilizacaoDaTransferenciaEntreUgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "TransferenciaEntreUgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O código da UG é o do Tribunal (6 dígitos); o CNPJ, quando há, tem 14.
ALTER TABLE "UnidadeGestora" ADD CONSTRAINT "UnidadeGestora_codigo_check" CHECK ("codigoTce" ~ '^[0-9]{6}$');
ALTER TABLE "UnidadeGestora" ADD CONSTRAINT "UnidadeGestora_cnpj_check" CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$');
-- A transferência: valor positivo, UGs distintas, e pelo menos um lado escriturado aqui.
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_valor_check" CHECK ("valor" > 0);
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_ugs_check" CHECK ("ugOrigemId" <> "ugDestinoId");
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_um_lado_check" CHECK ("lancamentoConcedidaId" IS NOT NULL OR "lancamentoRecebidaId" IS NOT NULL);
-- Cada lado escriturado tem a conta bancária dele; o estorno diz o motivo.
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_conta_origem_check" CHECK ("lancamentoConcedidaId" IS NULL OR "contaOrigemId" IS NOT NULL);
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_conta_destino_check" CHECK ("lancamentoRecebidaId" IS NULL OR "contaDestinoId" IS NOT NULL);
ALTER TABLE "TransferenciaEntreUgs" ADD CONSTRAINT "TransferenciaEntreUgs_motivo_check" CHECK ("estornoDeId" IS NULL OR ("motivo" IS NOT NULL AND length("motivo") >= 5));
