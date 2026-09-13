-- V5 Fila A — documento fiscal recebido (entidade) e o vínculo empenho × ordem de compra.
-- Aditiva: zero DROP. Situação e saldo continuam DERIVADOS.

CREATE TYPE "ModeloDeDocumentoFiscal" AS ENUM ('NFE', 'NFCE', 'NF_AVULSA', 'CTE', 'RPS', 'RECIBO', 'OUTRO');
CREATE TYPE "OrigemDoDocumentoFiscal" AS ENUM ('DIGITACAO', 'XML');
CREATE TYPE "TipoMovimentoDoDocumentoFiscal" AS ENUM ('CONFERENCIA', 'CANCELAMENTO', 'SUBSTITUICAO');

CREATE TABLE "DocumentoFiscalRecebido" (
    "id" TEXT NOT NULL,
    "emitenteId" TEXT NOT NULL,
    "modelo" "ModeloDeDocumentoFiscal" NOT NULL,
    "serie" VARCHAR(12) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataRecebimento" TIMESTAMP(3) NOT NULL,
    "chaveAcesso" VARCHAR(44),
    "protocoloExterno" TEXT,
    "ordemId" TEXT,
    "contratoId" TEXT,
    "empenhoId" TEXT,
    "processoId" TEXT,
    "valorBruto" DECIMAL(18,2) NOT NULL,
    "valorDescontos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorAcrescimos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorTributos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "origem" "OrigemDoDocumentoFiscal" NOT NULL,
    "arquivoHash" VARCHAR(64),
    "arquivoNome" TEXT,
    "validacaoEstrutural" TEXT,
    "substituiId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DocumentoFiscalRecebido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemDeDocumentoFiscal" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "materialId" TEXT,
    "itemDeOrdemId" TEXT,
    "codigo" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "valorUnitario" DECIMAL(18,6) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "acrescimo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ItemDeDocumentoFiscal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovimentoDoDocumentoFiscal" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDoDocumentoFiscal" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDoDocumentoFiscal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentoFiscalRecebido_emitenteId_modelo_serie_numero_key" ON "DocumentoFiscalRecebido"("emitenteId", "modelo", "serie", "numero");
CREATE INDEX "DocumentoFiscalRecebido_chaveAcesso_idx" ON "DocumentoFiscalRecebido"("chaveAcesso");
CREATE INDEX "DocumentoFiscalRecebido_ordemId_idx" ON "DocumentoFiscalRecebido"("ordemId");
CREATE INDEX "DocumentoFiscalRecebido_contratoId_idx" ON "DocumentoFiscalRecebido"("contratoId");
CREATE INDEX "DocumentoFiscalRecebido_empenhoId_idx" ON "DocumentoFiscalRecebido"("empenhoId");
CREATE INDEX "DocumentoFiscalRecebido_processoId_idx" ON "DocumentoFiscalRecebido"("processoId");
CREATE INDEX "DocumentoFiscalRecebido_dataRecebimento_idx" ON "DocumentoFiscalRecebido"("dataRecebimento");
CREATE INDEX "ItemDeDocumentoFiscal_documentoId_idx" ON "ItemDeDocumentoFiscal"("documentoId");
CREATE INDEX "ItemDeDocumentoFiscal_materialId_idx" ON "ItemDeDocumentoFiscal"("materialId");
CREATE INDEX "ItemDeDocumentoFiscal_itemDeOrdemId_idx" ON "ItemDeDocumentoFiscal"("itemDeOrdemId");
CREATE INDEX "MovimentoDoDocumentoFiscal_documentoId_tipo_idx" ON "MovimentoDoDocumentoFiscal"("documentoId", "tipo");

ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_emitenteId_fkey" FOREIGN KEY ("emitenteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "ProcessoLicitatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalRecebido" ADD CONSTRAINT "DocumentoFiscalRecebido_substituiId_fkey" FOREIGN KEY ("substituiId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemDeDocumentoFiscal" ADD CONSTRAINT "ItemDeDocumentoFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemDeDocumentoFiscal" ADD CONSTRAINT "ItemDeDocumentoFiscal_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemDeDocumentoFiscal" ADD CONSTRAINT "ItemDeDocumentoFiscal_itemDeOrdemId_fkey" FOREIGN KEY ("itemDeOrdemId") REFERENCES "ItemDeOrdemDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MovimentoDoDocumentoFiscal" ADD CONSTRAINT "MovimentoDoDocumentoFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Empenho" ADD COLUMN "ordemDeCompraId" TEXT;
CREATE INDEX "Empenho_ordemDeCompraId_idx" ON "Empenho"("ordemDeCompraId");
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_ordemDeCompraId_fkey" FOREIGN KEY ("ordemDeCompraId") REFERENCES "OrdemDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Liquidacao" ADD COLUMN "documentoFiscalId" TEXT;
CREATE INDEX "Liquidacao_documentoFiscalId_idx" ON "Liquidacao"("documentoFiscalId");
ALTER TABLE "Liquidacao" ADD CONSTRAINT "Liquidacao_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecebimentoDeOrdem" ADD COLUMN "documentoFiscalId" TEXT;
CREATE INDEX "RecebimentoDeOrdem_documentoFiscalId_idx" ON "RecebimentoDeOrdem"("documentoFiscalId");
ALTER TABLE "RecebimentoDeOrdem" ADD CONSTRAINT "RecebimentoDeOrdem_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Anexo" ADD COLUMN "documentoFiscalId" TEXT;
CREATE INDEX "Anexo_documentoFiscalId_idx" ON "Anexo"("documentoFiscalId");
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscalRecebido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
