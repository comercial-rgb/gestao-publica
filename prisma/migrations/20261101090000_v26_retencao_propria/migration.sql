-- V26 — o IR e o ISS retidos pelo próprio Tesouro como receita (cadeia A da ordem V26). Aditiva: duas
-- tabelas novas; nenhum pagamento, guia ou consignação existente muda.

CREATE TABLE "ClassificacaoDaRetencaoPropria" (
    "id" TEXT NOT NULL,
    "fato" VARCHAR(30) NOT NULL,
    "tipoConsignacaoId" TEXT NOT NULL,
    "naturezaReceitaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "contaVpaId" TEXT NOT NULL,
    "entidadeTitularId" TEXT,
    "vigenteDesde" DATE NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ClassificacaoDaRetencaoPropria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetencaoPropriaDoPagamento" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "classificacaoId" TEXT NOT NULL,
    "fato" VARCHAR(30) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "receitaArrecadadaId" TEXT NOT NULL,
    "grupoDaFolhaId" TEXT,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RetencaoPropriaDoPagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassificacaoDaRetencaoPropria_fato_vigenteDesde_idx" ON "ClassificacaoDaRetencaoPropria"("fato", "vigenteDesde");
CREATE UNIQUE INDEX "RetencaoPropriaDoPagamento_receitaArrecadadaId_key" ON "RetencaoPropriaDoPagamento"("receitaArrecadadaId");
CREATE UNIQUE INDEX "RetencaoPropriaDoPagamento_estornoDeId_key" ON "RetencaoPropriaDoPagamento"("estornoDeId");
CREATE INDEX "RetencaoPropriaDoPagamento_pagamentoId_idx" ON "RetencaoPropriaDoPagamento"("pagamentoId");
CREATE INDEX "RetencaoPropriaDoPagamento_grupoDaFolhaId_idx" ON "RetencaoPropriaDoPagamento"("grupoDaFolhaId");
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_tipoConsignacaoId_fkey" FOREIGN KEY ("tipoConsignacaoId") REFERENCES "TipoConsignacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_naturezaReceitaId_fkey" FOREIGN KEY ("naturezaReceitaId") REFERENCES "NaturezaReceita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_contaVpaId_fkey" FOREIGN KEY ("contaVpaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_entidadeTitularId_fkey" FOREIGN KEY ("entidadeTitularId") REFERENCES "EntidadeContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_classificacaoId_fkey" FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoDaRetencaoPropria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_receitaArrecadadaId_fkey" FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_grupoDaFolhaId_fkey" FOREIGN KEY ("grupoDaFolhaId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "RetencaoPropriaDoPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'ISS'));
ALTER TABLE "ClassificacaoDaRetencaoPropria" ADD CONSTRAINT "ClassificacaoDaRetencaoPropria_fundamento_check" CHECK (length(btrim("fundamento")) >= 10);
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_valor_check" CHECK ("valor" > 0);
ALTER TABLE "RetencaoPropriaDoPagamento" ADD CONSTRAINT "RetencaoPropriaDoPagamento_fato_check" CHECK ("fato" IN ('IRRF_FOLHA', 'IRRF_FORNECEDOR_PJ', 'ISS'));
