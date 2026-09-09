-- CreateEnum
CREATE TYPE "TipoMovimentoDotacao" AS ENUM ('DOTACAO_INICIAL', 'CREDITO_ADICIONAL', 'ANULACAO_CREDITO', 'RESERVA', 'RESERVA_LIBERADA', 'EMPENHO', 'EMPENHO_ANULADO');

-- CreateEnum
CREATE TYPE "TipoEmpenho" AS ENUM ('ORDINARIO', 'GLOBAL', 'ESTIMATIVO');

-- AlterTable
ALTER TABLE "FichaOrcamentaria" ADD COLUMN     "saldoAutorizado" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saldoDisponivel" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saldoEmpenhado" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saldoReservado" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MovimentoDotacao" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDotacao" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "origemId" TEXT,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaDotacao" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "licitacaoId" TEXT,
    "historico" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ReservaDotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaEmpenho" (
    "reservaId" TEXT NOT NULL,
    "empenhoId" TEXT NOT NULL,

    CONSTRAINT "ReservaEmpenho_pkey" PRIMARY KEY ("reservaId","empenhoId")
);

-- CreateTable
CREATE TABLE "Empenho" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "subelementoId" TEXT,
    "numero" TEXT NOT NULL,
    "tipo" "TipoEmpenho" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "credorCpfCnpj" TEXT NOT NULL,
    "historico" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Empenho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimentoDotacao_fichaId_tipo_idx" ON "MovimentoDotacao"("fichaId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentoDotacao_origemTipo_origemId_idx" ON "MovimentoDotacao"("origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "ReservaDotacao_fichaId_idx" ON "ReservaDotacao"("fichaId");

-- CreateIndex
CREATE INDEX "ReservaDotacao_estornoDeId_idx" ON "ReservaDotacao"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaEmpenho_empenhoId_key" ON "ReservaEmpenho"("empenhoId");

-- CreateIndex
CREATE INDEX "ReservaEmpenho_reservaId_idx" ON "ReservaEmpenho"("reservaId");

-- CreateIndex
CREATE UNIQUE INDEX "Empenho_lancamentoId_key" ON "Empenho"("lancamentoId");

-- CreateIndex
CREATE INDEX "Empenho_fichaId_idx" ON "Empenho"("fichaId");

-- CreateIndex
CREATE INDEX "Empenho_estornoDeId_idx" ON "Empenho"("estornoDeId");

-- CreateIndex
CREATE INDEX "Empenho_credorCpfCnpj_idx" ON "Empenho"("credorCpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Empenho_fichaId_numero_key" ON "Empenho"("fichaId", "numero");

-- AddForeignKey
ALTER TABLE "MovimentoDotacao" ADD CONSTRAINT "MovimentoDotacao_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaDotacao" ADD CONSTRAINT "ReservaDotacao_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaDotacao" ADD CONSTRAINT "ReservaDotacao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "ReservaDotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaEmpenho" ADD CONSTRAINT "ReservaEmpenho_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "ReservaDotacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaEmpenho" ADD CONSTRAINT "ReservaEmpenho_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_subelementoId_fkey" FOREIGN KEY ("subelementoId") REFERENCES "Subelemento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;
