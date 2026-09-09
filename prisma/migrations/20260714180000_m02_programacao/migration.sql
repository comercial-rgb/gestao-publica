-- M02 — CMD, MBA e limitação de empenho (TR 4.18/4.19/4.43/4.44).
-- ADITIVA: só cria tabelas e back-relations. Nenhuma coluna existente tocada.
-- O guard do 4.43 é OPT-IN (EventoLimitacaoEmpenho) e default OFF — sem a linha, o
-- empenhar roda idêntico. É o que preserva a regressão (779 intactos).

-- CreateTable
CREATE TABLE "VersaoCmd" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "atoRef" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoCmd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotaCmd" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotaCmd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoMba" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "atoRef" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoMba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaMba" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "bimestre" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaMba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiberacaoProgramacao" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "fonteId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "atoRef" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiberacaoProgramacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoLimitacaoEmpenho" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "atoRef" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoLimitacaoEmpenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDecreto" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateDecreto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VersaoCmd_exercicio_vigenteDesde_idx" ON "VersaoCmd"("exercicio", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoCmd_exercicio_numero_key" ON "VersaoCmd"("exercicio", "numero");

-- CreateIndex
CREATE INDEX "CotaCmd_fonteId_mes_idx" ON "CotaCmd"("fonteId", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "CotaCmd_versaoId_fonteId_mes_key" ON "CotaCmd"("versaoId", "fonteId", "mes");

-- CreateIndex
CREATE INDEX "VersaoMba_exercicio_vigenteDesde_idx" ON "VersaoMba"("exercicio", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoMba_exercicio_numero_key" ON "VersaoMba"("exercicio", "numero");

-- CreateIndex
CREATE INDEX "MetaMba_fonteId_bimestre_idx" ON "MetaMba"("fonteId", "bimestre");

-- CreateIndex
CREATE UNIQUE INDEX "MetaMba_versaoId_fonteId_bimestre_key" ON "MetaMba"("versaoId", "fonteId", "bimestre");

-- CreateIndex
CREATE INDEX "LiberacaoProgramacao_exercicio_fonteId_mes_idx" ON "LiberacaoProgramacao"("exercicio", "fonteId", "mes");

-- CreateIndex
CREATE INDEX "EventoLimitacaoEmpenho_exercicio_criadoEm_idx" ON "EventoLimitacaoEmpenho"("exercicio", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDecreto_tipo_key" ON "TemplateDecreto"("tipo");

-- AddForeignKey
ALTER TABLE "CotaCmd" ADD CONSTRAINT "CotaCmd_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoCmd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotaCmd" ADD CONSTRAINT "CotaCmd_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMba" ADD CONSTRAINT "MetaMba_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "VersaoMba"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMba" ADD CONSTRAINT "MetaMba_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiberacaoProgramacao" ADD CONSTRAINT "LiberacaoProgramacao_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

