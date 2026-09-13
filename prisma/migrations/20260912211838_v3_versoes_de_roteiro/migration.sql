-- Orquestracao V3, 4.5 - as VERSOES de roteiro (append-only), o vinculo do movimento com a
-- versao que usou, e a acao de PUBLICAR. ADITIVA: tabela nova, coluna anulavel, valores de
-- enum. Zero DROP. As tabelas legadas RoteiroPatrimonial/RoteiroResultadoAlienacao ficam,
-- so leitura, como origem das versoes 1.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'PUBLICAR_ROTEIRO_PATRIMONIAL';

CREATE TYPE "FamiliaDeRoteiro" AS ENUM ('PATRIMONIAL', 'RESULTADO_ALIENACAO');
CREATE TYPE "SituacaoDeVersaoDeRoteiro" AS ENUM ('PROPOSTA', 'PUBLICADA');

CREATE TABLE "VersaoDeRoteiro" (
    "id" TEXT NOT NULL,
    "familia" "FamiliaDeRoteiro" NOT NULL,
    "chave" VARCHAR(60) NOT NULL,
    "numero" INTEGER NOT NULL,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "situacao" "SituacaoDeVersaoDeRoteiro" NOT NULL DEFAULT 'PROPOSTA',
    "publicadaEm" TIMESTAMP(3),
    "publicadaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VersaoDeRoteiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VersaoDeRoteiro_familia_chave_numero_key" ON "VersaoDeRoteiro"("familia", "chave", "numero");
CREATE INDEX "VersaoDeRoteiro_familia_chave_situacao_publicadaEm_idx" ON "VersaoDeRoteiro"("familia", "chave", "situacao", "publicadaEm");

ALTER TABLE "VersaoDeRoteiro" ADD CONSTRAINT "VersaoDeRoteiro_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VersaoDeRoteiro" ADD CONSTRAINT "VersaoDeRoteiro_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentoPatrimonial" ADD COLUMN "versaoDeRoteiroId" TEXT;
CREATE INDEX "MovimentoPatrimonial_versaoDeRoteiroId_idx" ON "MovimentoPatrimonial"("versaoDeRoteiroId");
ALTER TABLE "MovimentoPatrimonial" ADD CONSTRAINT "MovimentoPatrimonial_versaoDeRoteiroId_fkey" FOREIGN KEY ("versaoDeRoteiroId") REFERENCES "VersaoDeRoteiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
