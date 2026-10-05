-- V35 — a realocação por decreto sob a autorização percentual da LOA (Lei 4.320, art. 7º). Aditiva.
ALTER TABLE "AtoDeRealocacao" ADD COLUMN "autorizacaoDaLoaId" TEXT;

ALTER TABLE "AtoDeRealocacao" ADD CONSTRAINT "AtoDeRealocacao_autorizacaoDaLoaId_fkey" FOREIGN KEY ("autorizacaoDaLoaId") REFERENCES "LeiCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
