-- V26 — a regularização do legado: o saldo de IR/ISS do próprio Tesouro que estava como consignação é baixado
-- contra a receita, sem saída de banco. Aditiva: um valor novo no enum dos movimentos do M07 e uma tabela nova.

ALTER TYPE "TipoMovimentoExtra" ADD VALUE 'APROPRIACAO_COMO_RECEITA';

CREATE TABLE "ApropriacaoDaConsignacaoPropria" (
    "id" TEXT NOT NULL,
    "ingressoId" TEXT NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "classificacaoId" TEXT NOT NULL,
    "receitaArrecadadaId" TEXT NOT NULL,
    "reconhecimentoId" TEXT,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ApropriacaoDaConsignacaoPropria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApropriacaoDaConsignacaoPropria_ingressoId_key" ON "ApropriacaoDaConsignacaoPropria"("ingressoId");
CREATE UNIQUE INDEX "ApropriacaoDaConsignacaoPropria_movimentoId_key" ON "ApropriacaoDaConsignacaoPropria"("movimentoId");
CREATE UNIQUE INDEX "ApropriacaoDaConsignacaoPropria_receitaArrecadadaId_key" ON "ApropriacaoDaConsignacaoPropria"("receitaArrecadadaId");
ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_ingressoId_fkey" FOREIGN KEY ("ingressoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoExtraorcamentario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_classificacaoId_fkey" FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoDaRetencaoPropria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_valor_check" CHECK ("valor" > 0);
ALTER TABLE "ApropriacaoDaConsignacaoPropria" ADD CONSTRAINT "ApropriacaoDaConsignacaoPropria_motivo_check" CHECK (length(btrim("motivo")) >= 10);
