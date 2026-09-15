-- V7 M2 U2 — A MEDIÇÃO DA ORDEM DE SERVIÇO E OS RECEBIMENTOS POR PARCELA (Lei 14.133, art. 140). Aditiva.
-- Medição por itens da ordem; recebimento provisório com a conferência por item (conforme e em controvérsia);
-- decisão da controvérsia (aceita / rejeitada); recebimento definitivo do que é elegível. Cada termo guarda o
-- manifesto canônico e o sha256.
CREATE TYPE "ResultadoDaControversia" AS ENUM ('ACEITA', 'REJEITADA');

CREATE TABLE "MedicaoDaOrdemDeServico" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "MedicaoDaOrdemDeServico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_medicao_da_ordem" CHECK ("numero" >= 1 AND "periodoFim" >= "periodoInicio")
);
CREATE TABLE "ItemMedidoNaOrdem" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "itemDaOrdemId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ItemMedidoNaOrdem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_item_medido_na_ordem" CHECK ("quantidade" > 0 AND "valorUnitario" >= 0 AND "valor" >= 0)
);
CREATE TABLE "RecebimentoProvisorio" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "verificacoes" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RecebimentoProvisorio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_recebimento_provisorio" CHECK (length(btrim("verificacoes")) >= 5)
);
CREATE TABLE "ConferenciaDoItemMedido" (
    "id" TEXT NOT NULL,
    "recebimentoProvisorioId" TEXT NOT NULL,
    "itemMedidoId" TEXT NOT NULL,
    "quantidadeConforme" DECIMAL(18,4) NOT NULL,
    "quantidadeEmControversia" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    CONSTRAINT "ConferenciaDoItemMedido_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_conferencia_do_item_medido" CHECK ("quantidadeConforme" >= 0 AND "quantidadeEmControversia" >= 0 AND ("quantidadeEmControversia" = 0 OR length(btrim(coalesce("motivo", ''))) >= 5))
);
CREATE TABLE "DecisaoDeControversia" (
    "id" TEXT NOT NULL,
    "conferenciaId" TEXT NOT NULL,
    "resultado" "ResultadoDaControversia" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "DecisaoDeControversia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_decisao_de_controversia" CHECK (length(btrim("fundamento")) >= 5)
);
CREATE TABLE "RecebimentoDefinitivo" (
    "id" TEXT NOT NULL,
    "medicaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "conclusao" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RecebimentoDefinitivo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_recebimento_definitivo" CHECK ("numero" >= 1 AND length(btrim("conclusao")) >= 5)
);
CREATE TABLE "ItemRecebidoDefinitivamente" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "itemMedidoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ItemRecebidoDefinitivamente_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_item_recebido_definitivamente" CHECK ("quantidade" > 0 AND "valor" >= 0)
);

CREATE UNIQUE INDEX "MedicaoDaOrdemDeServico_ordemId_numero_key" ON "MedicaoDaOrdemDeServico"("ordemId", "numero");
CREATE UNIQUE INDEX "ItemMedidoNaOrdem_medicaoId_itemDaOrdemId_key" ON "ItemMedidoNaOrdem"("medicaoId", "itemDaOrdemId");
CREATE INDEX "ItemMedidoNaOrdem_itemDaOrdemId_idx" ON "ItemMedidoNaOrdem"("itemDaOrdemId");
CREATE UNIQUE INDEX "RecebimentoProvisorio_medicaoId_key" ON "RecebimentoProvisorio"("medicaoId");
CREATE UNIQUE INDEX "ConferenciaDoItemMedido_itemMedidoId_key" ON "ConferenciaDoItemMedido"("itemMedidoId");
CREATE INDEX "ConferenciaDoItemMedido_recebimentoProvisorioId_idx" ON "ConferenciaDoItemMedido"("recebimentoProvisorioId");
CREATE UNIQUE INDEX "DecisaoDeControversia_conferenciaId_key" ON "DecisaoDeControversia"("conferenciaId");
CREATE UNIQUE INDEX "RecebimentoDefinitivo_medicaoId_numero_key" ON "RecebimentoDefinitivo"("medicaoId", "numero");
CREATE UNIQUE INDEX "ItemRecebidoDefinitivamente_recebimentoId_itemMedidoId_key" ON "ItemRecebidoDefinitivamente"("recebimentoId", "itemMedidoId");
CREATE INDEX "ItemRecebidoDefinitivamente_itemMedidoId_idx" ON "ItemRecebidoDefinitivamente"("itemMedidoId");

ALTER TABLE "MedicaoDaOrdemDeServico" ADD CONSTRAINT "MedicaoDaOrdemDeServico_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeServicoDoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicaoDaOrdemDeServico" ADD CONSTRAINT "MedicaoDaOrdemDeServico_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemMedidoNaOrdem" ADD CONSTRAINT "ItemMedidoNaOrdem_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemMedidoNaOrdem" ADD CONSTRAINT "ItemMedidoNaOrdem_itemDaOrdemId_fkey" FOREIGN KEY ("itemDaOrdemId") REFERENCES "ItemDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecebimentoProvisorio" ADD CONSTRAINT "RecebimentoProvisorio_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecebimentoProvisorio" ADD CONSTRAINT "RecebimentoProvisorio_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenciaDoItemMedido" ADD CONSTRAINT "ConferenciaDoItemMedido_recebimentoProvisorioId_fkey" FOREIGN KEY ("recebimentoProvisorioId") REFERENCES "RecebimentoProvisorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenciaDoItemMedido" ADD CONSTRAINT "ConferenciaDoItemMedido_itemMedidoId_fkey" FOREIGN KEY ("itemMedidoId") REFERENCES "ItemMedidoNaOrdem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisaoDeControversia" ADD CONSTRAINT "DecisaoDeControversia_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "ConferenciaDoItemMedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisaoDeControversia" ADD CONSTRAINT "DecisaoDeControversia_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecebimentoDefinitivo" ADD CONSTRAINT "RecebimentoDefinitivo_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "MedicaoDaOrdemDeServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecebimentoDefinitivo" ADD CONSTRAINT "RecebimentoDefinitivo_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoNoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemRecebidoDefinitivamente" ADD CONSTRAINT "ItemRecebidoDefinitivamente_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "RecebimentoDefinitivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemRecebidoDefinitivamente" ADD CONSTRAINT "ItemRecebidoDefinitivamente_itemMedidoId_fkey" FOREIGN KEY ("itemMedidoId") REFERENCES "ItemMedidoNaOrdem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
