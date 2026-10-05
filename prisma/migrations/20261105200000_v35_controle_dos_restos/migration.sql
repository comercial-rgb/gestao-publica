-- CreateTable
CREATE TABLE "DeclaracaoDoControleDosRestos" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeclaracaoDoControleDosRestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaDoControleDosRestos" (
    "id" TEXT NOT NULL,
    "declaracaoId" TEXT NOT NULL,
    "papel" VARCHAR(40) NOT NULL,
    "contaId" TEXT NOT NULL,

    CONSTRAINT "ContaDoControleDosRestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControleDoRestoAPagar" (
    "id" TEXT NOT NULL,
    "inscricaoId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "evento" VARCHAR(30) NOT NULL,
    "lancamentoDoFatoId" TEXT,
    "exercicio" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ControleDoRestoAPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeclaracaoDoControleDosRestos_versao_key" ON "DeclaracaoDoControleDosRestos"("versao");

-- CreateIndex
CREATE UNIQUE INDEX "ContaDoControleDosRestos_declaracaoId_papel_key" ON "ContaDoControleDosRestos"("declaracaoId", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "ControleDoRestoAPagar_lancamentoId_key" ON "ControleDoRestoAPagar"("lancamentoId");

-- CreateIndex
CREATE INDEX "ControleDoRestoAPagar_inscricaoId_evento_idx" ON "ControleDoRestoAPagar"("inscricaoId", "evento");

-- CreateIndex
CREATE INDEX "ControleDoRestoAPagar_lancamentoDoFatoId_idx" ON "ControleDoRestoAPagar"("lancamentoDoFatoId");

-- AddForeignKey
ALTER TABLE "ContaDoControleDosRestos" ADD CONSTRAINT "ContaDoControleDosRestos_declaracaoId_fkey" FOREIGN KEY ("declaracaoId") REFERENCES "DeclaracaoDoControleDosRestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaDoControleDosRestos" ADD CONSTRAINT "ContaDoControleDosRestos_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControleDoRestoAPagar" ADD CONSTRAINT "ControleDoRestoAPagar_inscricaoId_fkey" FOREIGN KEY ("inscricaoId") REFERENCES "InscricaoRestosAPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControleDoRestoAPagar" ADD CONSTRAINT "ControleDoRestoAPagar_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControleDoRestoAPagar" ADD CONSTRAINT "ControleDoRestoAPagar_lancamentoDoFatoId_fkey" FOREIGN KEY ("lancamentoDoFatoId") REFERENCES "LancamentoContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

