-- V36 — o número do contrato da parceria é único (achado da auditoria: dois cadastros do mesmo contrato dividiriam os empenhos). Aditiva.

-- CreateIndex
CREATE UNIQUE INDEX "ContratoPPP_numero_key" ON "ContratoPPP"("numero");

