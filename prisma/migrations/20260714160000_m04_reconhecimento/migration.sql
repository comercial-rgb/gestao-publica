-- M04 — RECONHECIMENTO DA RECEITA PELO FATO GERADOR (TR 5.87/5.88 · 4.62 · NBC TSP).
--
-- ADITIVA: só cria tabelas e back-relations. Nenhuma coluna existente é tocada — a
-- `ReceitaArrecadada`, o `LancamentoContabil` e o `MovimentoDividaAtiva` seguem idênticos.
-- Toda arrecadação e toda inscrição de HOJE continua funcionando byte a byte (regressão
-- provada no t4).
--
-- ⚠️ A COMPETÊNCIA RENASCE AQUI — o outro lado de c398b4f. Aquele commit removeu a
-- `competencia` DORMENTE do lançamento (herdada, divergente, SEM LEITOR) e prometeu, por
-- escrito, que a competência de verdade nasceria na ENTIDADE DONA, com LEITOR no mesmo
-- commit. É este: `ReceitaReconhecida.dataFatoGerador`, e `saldoAArrecadar` corta por ela
-- desde o primeiro dia (t1 prova que ela GOVERNA o corte). Coluna sem leitor não entra —
-- e esta entra com um.
--
-- ⚠️ SIGILO FISCAL (TR 7.4.2): `contribuinteRef` é OPACA e NUNCA sai nos datasets do M13
-- (o `datasetReceita` é agregado por natureza+fonte e não conhece esta tabela). Grep-teste
-- prova a ausência (t9).

-- CreateTable
CREATE TABLE "ReceitaReconhecida" (
    "id" TEXT NOT NULL,
    "naturezaCodigo" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "dataFatoGerador" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "contribuinteRef" TEXT,
    "historico" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceitaReconhecida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoteiroReconhecimento" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "contaCreditoAReceberId" TEXT NOT NULL,
    "contaVpaId" TEXT NOT NULL,
    "contaVpdId" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoteiroReconhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoArrecadacaoReconhecimento" (
    "id" TEXT NOT NULL,
    "arrecadacaoId" TEXT NOT NULL,
    "reconhecimentoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoArrecadacaoReconhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscricaoDeReconhecimento" (
    "id" TEXT NOT NULL,
    "reconhecimentoId" TEXT NOT NULL,
    "movimentoDividaAtivaId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InscricaoDeReconhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelamentoDeReconhecimento" (
    "id" TEXT NOT NULL,
    "reconhecimentoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancelamentoDeReconhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaReconhecida_referenciaExterna_key" ON "ReceitaReconhecida"("referenciaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaReconhecida_lancamentoId_key" ON "ReceitaReconhecida"("lancamentoId");

-- CreateIndex
CREATE INDEX "ReceitaReconhecida_naturezaCodigo_dataFatoGerador_idx" ON "ReceitaReconhecida"("naturezaCodigo", "dataFatoGerador");

-- CreateIndex
CREATE INDEX "ReceitaReconhecida_fonteId_idx" ON "ReceitaReconhecida"("fonteId");

-- CreateIndex
CREATE INDEX "ReceitaReconhecida_estornoDeId_idx" ON "ReceitaReconhecida"("estornoDeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroReconhecimento_origem_key" ON "RoteiroReconhecimento"("origem");

-- CreateIndex
CREATE INDEX "VinculoArrecadacaoReconhecimento_reconhecimentoId_idx" ON "VinculoArrecadacaoReconhecimento"("reconhecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoArrecadacaoReconhecimento_arrecadacaoId_reconhecimen_key" ON "VinculoArrecadacaoReconhecimento"("arrecadacaoId", "reconhecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "InscricaoDeReconhecimento_movimentoDividaAtivaId_key" ON "InscricaoDeReconhecimento"("movimentoDividaAtivaId");

-- CreateIndex
CREATE INDEX "InscricaoDeReconhecimento_reconhecimentoId_idx" ON "InscricaoDeReconhecimento"("reconhecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "CancelamentoDeReconhecimento_lancamentoId_key" ON "CancelamentoDeReconhecimento"("lancamentoId");

-- CreateIndex
CREATE INDEX "CancelamentoDeReconhecimento_reconhecimentoId_idx" ON "CancelamentoDeReconhecimento"("reconhecimentoId");

-- AddForeignKey
ALTER TABLE "ReceitaReconhecida" ADD CONSTRAINT "ReceitaReconhecida_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaReconhecida" ADD CONSTRAINT "ReceitaReconhecida_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaReconhecida" ADD CONSTRAINT "ReceitaReconhecida_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "ReceitaReconhecida"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroReconhecimento" ADD CONSTRAINT "RoteiroReconhecimento_contaCreditoAReceberId_fkey" FOREIGN KEY ("contaCreditoAReceberId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroReconhecimento" ADD CONSTRAINT "RoteiroReconhecimento_contaVpaId_fkey" FOREIGN KEY ("contaVpaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoteiroReconhecimento" ADD CONSTRAINT "RoteiroReconhecimento_contaVpdId_fkey" FOREIGN KEY ("contaVpdId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoArrecadacaoReconhecimento" ADD CONSTRAINT "VinculoArrecadacaoReconhecimento_arrecadacaoId_fkey" FOREIGN KEY ("arrecadacaoId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoArrecadacaoReconhecimento" ADD CONSTRAINT "VinculoArrecadacaoReconhecimento_reconhecimentoId_fkey" FOREIGN KEY ("reconhecimentoId") REFERENCES "ReceitaReconhecida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoDeReconhecimento" ADD CONSTRAINT "InscricaoDeReconhecimento_reconhecimentoId_fkey" FOREIGN KEY ("reconhecimentoId") REFERENCES "ReceitaReconhecida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoDeReconhecimento" ADD CONSTRAINT "InscricaoDeReconhecimento_movimentoDividaAtivaId_fkey" FOREIGN KEY ("movimentoDividaAtivaId") REFERENCES "MovimentoDividaAtiva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDeReconhecimento" ADD CONSTRAINT "CancelamentoDeReconhecimento_reconhecimentoId_fkey" FOREIGN KEY ("reconhecimentoId") REFERENCES "ReceitaReconhecida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelamentoDeReconhecimento" ADD CONSTRAINT "CancelamentoDeReconhecimento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

