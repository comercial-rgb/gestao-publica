-- ============================================================================
-- M09 — MOVIMENTACAO BANCARIA (TR 5.62) e os dois tipos conciliaveis que
-- faltavam. Aditiva: nenhum DROP, nenhuma coluna existente alterada.
-- ============================================================================

-- ── O que a conta bancaria faz, alem de pagar e receber ─────────────────────
CREATE TYPE "TipoMovimentoBancario" AS ENUM (
  'DEPOSITO', 'SAQUE', 'APLICACAO', 'RESGATE', 'RENDIMENTO', 'TARIFA'
);

-- ── Dois tipos conciliaveis novos ───────────────────────────────────────────
-- MOVIMENTO_BANCARIO: a linha de tarifa do extrato precisa ter contra o que ser
-- conciliada.
-- TRANSFERENCIA: ela FALTAVA, e a falta era um defeito. A transferencia move as
-- duas contas e aparece nos DOIS extratos, mas nao era tipo conciliavel — aquelas
-- linhas nao podiam ser conciliadas por caminho nenhum, e a conciliacao de uma
-- conta que ja tivesse recebido uma transferencia nunca fechava.
ALTER TYPE "TipoInternoConciliacao" ADD VALUE IF NOT EXISTS 'MOVIMENTO_BANCARIO';
ALTER TYPE "TipoInternoConciliacao" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';

-- ── O fato ──────────────────────────────────────────────────────────────────
CREATE TABLE "MovimentoBancario" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoBancario" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "historico" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "MovimentoBancario_pkey" PRIMARY KEY ("id")
);

-- ⚠️ 1-1 COM O RAZAO. Dois movimentos apontando para o mesmo lancamento seriam
-- um fato contabilizado uma vez e contado duas no saldo da conta.
CREATE UNIQUE INDEX "MovimentoBancario_lancamentoId_key" ON "MovimentoBancario"("lancamentoId");
CREATE INDEX "MovimentoBancario_contaBancariaId_data_idx" ON "MovimentoBancario"("contaBancariaId", "data");
CREATE INDEX "MovimentoBancario_estornoDeId_idx" ON "MovimentoBancario"("estornoDeId");

ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_contaBancariaId_fkey"
  FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_lancamentoId_fkey"
  FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_estornoDeId_fkey"
  FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoBancario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ⚠️ UM ESTORNO POR MOVIMENTO, NO BANCO. Sem isto, duas requisicoes simultaneas
-- de estorno leriam ambas "ainda nao estornado" e gravariam as duas — e o saldo
-- da conta voltaria o valor DUAS vezes. E a mesma disciplina do indice unico
-- parcial do M05 e da BaixaDeRetornoBancario.
CREATE UNIQUE INDEX "uq_estorno_movimento_bancario_unico"
    ON "MovimentoBancario"("estornoDeId") WHERE "estornoDeId" IS NOT NULL;
