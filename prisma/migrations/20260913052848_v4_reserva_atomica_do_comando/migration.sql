-- Sessão noturna V4 (3) — a reserva atômica do comando. ADITIVA: um valor de enum, um enum novo,
-- uma tabela nova e seus índices. Zero DROP, zero ALTER de coluna existente.
ALTER TYPE "ResultadoOperacao" ADD VALUE 'REPLAY';

CREATE TYPE "EstadoDoComando" AS ENUM ('RESERVADO', 'CONCLUIDO', 'LIBERADO');

CREATE TABLE "ComandoDeBorda" (
    "id" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "usuarioIdent" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "estado" "EstadoDoComando" NOT NULL,
    "operacaoId" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 1,
    "reservadoEm" TIMESTAMP(3) NOT NULL,
    "concluidoEm" TIMESTAMP(3),
    "tipoDoResultado" TEXT,
    "resultadoRef" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComandoDeBorda_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComandoDeBorda_escopo_usuarioIdent_acao_chave_key" ON "ComandoDeBorda"("escopo", "usuarioIdent", "acao", "chave");
CREATE INDEX "ComandoDeBorda_operacaoId_idx" ON "ComandoDeBorda"("operacaoId");
CREATE INDEX "ComandoDeBorda_estado_reservadoEm_idx" ON "ComandoDeBorda"("estado", "reservadoEm");
