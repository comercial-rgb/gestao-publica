-- V34 — a regularização da entidade de um movimento extraorçamentário sem titular derivável (insert-only, uma por
-- movimento). Aditiva: uma tabela, dois índices, duas FKs. Nada é removido.

-- CreateTable
CREATE TABLE "AtribuicaoDeEntidadeDoMovimentoExtra" (
    "id" TEXT NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "atoTipo" "TipoDeAtoDeclarado" NOT NULL,
    "atoNumero" TEXT NOT NULL,
    "atoAno" INTEGER NOT NULL,
    "atoDispositivo" TEXT NOT NULL,
    "atoCitacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AtribuicaoDeEntidadeDoMovimentoExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtribuicaoDeEntidadeDoMovimentoExtra_movimentoId_key" ON "AtribuicaoDeEntidadeDoMovimentoExtra"("movimentoId");

-- CreateIndex
CREATE INDEX "AtribuicaoDeEntidadeDoMovimentoExtra_entidadeId_idx" ON "AtribuicaoDeEntidadeDoMovimentoExtra"("entidadeId");

-- AddForeignKey
ALTER TABLE "AtribuicaoDeEntidadeDoMovimentoExtra" ADD CONSTRAINT "AtribuicaoDeEntidadeDoMovimentoExtra_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtribuicaoDeEntidadeDoMovimentoExtra" ADD CONSTRAINT "AtribuicaoDeEntidadeDoMovimentoExtra_entidadeId_fkey" FOREIGN KEY ("entidadeId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
