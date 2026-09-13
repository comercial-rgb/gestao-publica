-- Sessão noturna V4 (§5) — a emissão congelada do termo patrimonial e o termo assinado como anexo.
-- ADITIVA: colunas anuláveis e um índice. Zero DROP.
ALTER TABLE "TermoPatrimonial" ADD COLUMN "emissao" JSONB,
ADD COLUMN "emissaoSha256" VARCHAR(64),
ADD COLUMN "modeloDaEmissao" VARCHAR(40),
ADD COLUMN "emitidoEm" TIMESTAMP(3);

ALTER TABLE "Anexo" ADD COLUMN "termoPatrimonialId" TEXT;
CREATE INDEX "Anexo_termoPatrimonialId_idx" ON "Anexo"("termoPatrimonialId");
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_termoPatrimonialId_fkey" FOREIGN KEY ("termoPatrimonialId") REFERENCES "TermoPatrimonial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
