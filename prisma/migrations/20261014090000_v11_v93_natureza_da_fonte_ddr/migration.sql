-- V11 V9.3 — A NATUREZA DA FONTE, PARA O CONTROLE DA DISPONIBILIDADE (PCASP 7.2.1.1).
--
-- ADITIVA, ZERO DROP. O `migrate dev --create-only` gerou junto 8 pares
-- DROP CONSTRAINT/ADD CONSTRAINT de chaves estrangeiras que NADA têm com esta mudança
-- (CampoDoEvento, DecisaoDoTipoDeConsignacao, EventoDoLeiaute, FatoDoPedidoDeAcesso x2,
-- FolhaDePagamento, ReceitaArrecadada, ReservaDeAtendimento) — deriva antiga do schema,
-- que o gerador recicla em toda migração nova. Foram RETIRADAS à mão: uma migração que
-- derruba e recria a FK de `ReceitaArrecadada.entidadeTitularId` para criar uma tabela de
-- de-para é uma migração que faz duas coisas, e a segunda ninguém pediu.

-- CreateEnum
CREATE TYPE "NaturezaDaFonteDdr" AS ENUM ('ORDINARIOS', 'VINCULADOS', 'EXTRAORCAMENTARIOS', 'COMPENSACAO_FINANCEIRA', 'OUTROS');

-- CreateTable
CREATE TABLE "DeParaFonteNaturezaDdr" (
    "id" TEXT NOT NULL,
    "fonteCodigo" VARCHAR(3) NOT NULL,
    "natureza" "NaturezaDaFonteDdr" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeParaFonteNaturezaDdr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeParaFonteNaturezaDdr_fonteCodigo_versao_idx" ON "DeParaFonteNaturezaDdr"("fonteCodigo", "versao");

-- CreateIndex
CREATE INDEX "DeParaFonteNaturezaDdr_natureza_idx" ON "DeParaFonteNaturezaDdr"("natureza");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaFonteNaturezaDdr_fonteCodigo_versao_key" ON "DeParaFonteNaturezaDdr"("fonteCodigo", "versao");
