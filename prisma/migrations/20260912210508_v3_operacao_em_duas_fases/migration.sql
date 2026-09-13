-- AlterEnum + AlterTable
--
-- Orquestracao V3, 4.3 - o registro de operacao em DUAS fases, append-only: INICIADA antes
-- do ato (fora da transacao), SUCESSO dentro da transacao do fato (pelo funil do razao),
-- CONCLUIDA/NEGADO/ERRO depois. ADITIVA: valores de enum e colunas anulaveis. Zero DROP.
ALTER TYPE "ResultadoOperacao" ADD VALUE 'INICIADA';
ALTER TYPE "ResultadoOperacao" ADD VALUE 'CONCLUIDA';

ALTER TABLE "RegistroDeOperacao" ADD COLUMN "chave" TEXT,
ADD COLUMN "fingerprint" TEXT,
ADD COLUMN "operacaoId" TEXT,
ADD COLUMN "lancamentoId" TEXT,
ADD COLUMN "resultadoRef" TEXT;

-- CreateIndex
CREATE INDEX "RegistroDeOperacao_usuarioIdent_acao_chave_idx" ON "RegistroDeOperacao"("usuarioIdent", "acao", "chave");
CREATE INDEX "RegistroDeOperacao_operacaoId_idx" ON "RegistroDeOperacao"("operacaoId");
