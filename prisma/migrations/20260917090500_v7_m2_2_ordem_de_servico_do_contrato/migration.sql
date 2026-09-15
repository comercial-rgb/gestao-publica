-- V7 M2 U1 — A ORDEM DE SERVIÇO DO CONTRATO: a autorização de execução ao contratado, por itens do contrato. Aditiva.
-- Rascunho, emissão (com o manifesto canônico e o sha256), descarte, cancelamento de saldo e suspensão/retomada são
-- fatos; nenhuma coluna de situação ou de saldo.
CREATE TYPE "TipoDoMovimentoDeExecucao" AS ENUM ('SUSPENSAO', 'RETOMADA');

CREATE TABLE "OrdemDeServicoDoContrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "finalidade" TEXT NOT NULL,
    "local" TEXT,
    "unidadeSolicitante" TEXT,
    "inicioPrevisto" TIMESTAMP(3) NOT NULL,
    "fimPrevisto" TIMESTAMP(3) NOT NULL,
    "condicoesDeRecebimento" TEXT NOT NULL,
    "gestorDesignacaoId" TEXT NOT NULL,
    "fiscalDesignacaoId" TEXT NOT NULL,
    "empenhoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "OrdemDeServicoDoContrato_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_ordem_de_servico" CHECK ("numero" >= 1 AND "fimPrevisto" >= "inicioPrevisto" AND length(btrim("finalidade")) >= 5 AND length(btrim("condicoesDeRecebimento")) >= 5)
);
CREATE TABLE "ItemDaOrdemDeServico" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "itemDoContratoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ItemDaOrdemDeServico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_item_da_ordem_de_servico" CHECK ("quantidade" > 0 AND "valorUnitario" >= 0)
);
CREATE TABLE "EmissaoDaOrdemDeServico" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "inicioAutorizado" TIMESTAMP(3) NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "EmissaoDaOrdemDeServico_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DescarteDaOrdemDeServico" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "DescarteDaOrdemDeServico_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CancelamentoDeSaldoDaOrdem" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "itemDaOrdemId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "CancelamentoDeSaldoDaOrdem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_cancelamento_de_saldo_da_ordem" CHECK ("quantidade" > 0 AND length(btrim("motivo")) >= 5)
);
CREATE TABLE "MovimentoDeExecucaoDaOrdem" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoDoMovimentoDeExecucao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "MovimentoDeExecucaoDaOrdem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrdemDeServicoDoContrato_contratoId_numero_key" ON "OrdemDeServicoDoContrato"("contratoId", "numero");
CREATE INDEX "OrdemDeServicoDoContrato_empenhoId_idx" ON "OrdemDeServicoDoContrato"("empenhoId");
CREATE UNIQUE INDEX "ItemDaOrdemDeServico_ordemId_itemDoContratoId_key" ON "ItemDaOrdemDeServico"("ordemId", "itemDoContratoId");
CREATE INDEX "ItemDaOrdemDeServico_itemDoContratoId_idx" ON "ItemDaOrdemDeServico"("itemDoContratoId");
CREATE UNIQUE INDEX "EmissaoDaOrdemDeServico_ordemId_key" ON "EmissaoDaOrdemDeServico"("ordemId");
CREATE UNIQUE INDEX "DescarteDaOrdemDeServico_ordemId_key" ON "DescarteDaOrdemDeServico"("ordemId");
CREATE INDEX "CancelamentoDeSaldoDaOrdem_ordemId_idx" ON "CancelamentoDeSaldoDaOrdem"("ordemId");
CREATE INDEX "CancelamentoDeSaldoDaOrdem_itemDaOrdemId_idx" ON "CancelamentoDeSaldoDaOrdem"("itemDaOrdemId");
CREATE INDEX "MovimentoDeExecucaoDaOrdem_ordemId_data_idx" ON "MovimentoDeExecucaoDaOrdem"("ordemId", "data");

ALTER TABLE "OrdemDeServicoDoContrato" ADD CONSTRAINT "OrdemDeServicoDoContrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemDeServicoDoContrato" ADD CONSTRAINT "OrdemDeServicoDoContrato_gestorDesignacaoId_fkey" FOREIGN KEY ("gestorDesignacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemDeServicoDoContrato" ADD CONSTRAINT "OrdemDeServicoDoContrato_fiscalDesignacaoId_fkey" FOREIGN KEY ("fiscalDesignacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemDeServicoDoContrato" ADD CONSTRAINT "OrdemDeServicoDoContrato_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemDaOrdemDeServico" ADD CONSTRAINT "ItemDaOrdemDeServico_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemDaOrdemDeServico" ADD CONSTRAINT "ItemDaOrdemDeServico_itemDoContratoId_fkey" FOREIGN KEY ("itemDoContratoId") REFERENCES "ItemDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmissaoDaOrdemDeServico" ADD CONSTRAINT "EmissaoDaOrdemDeServico_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmissaoDaOrdemDeServico" ADD CONSTRAINT "EmissaoDaOrdemDeServico_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DescarteDaOrdemDeServico" ADD CONSTRAINT "DescarteDaOrdemDeServico_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CancelamentoDeSaldoDaOrdem" ADD CONSTRAINT "CancelamentoDeSaldoDaOrdem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CancelamentoDeSaldoDaOrdem" ADD CONSTRAINT "CancelamentoDeSaldoDaOrdem_itemDaOrdemId_fkey" FOREIGN KEY ("itemDaOrdemId") REFERENCES "ItemDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CancelamentoDeSaldoDaOrdem" ADD CONSTRAINT "CancelamentoDeSaldoDaOrdem_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentoDeExecucaoDaOrdem" ADD CONSTRAINT "MovimentoDeExecucaoDaOrdem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentoDeExecucaoDaOrdem" ADD CONSTRAINT "MovimentoDeExecucaoDaOrdem_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
