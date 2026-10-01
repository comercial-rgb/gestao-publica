-- V24 — o CPF/CNPJ do beneficiário do recolhimento extraorçamentário (SAGRES DespesaExtra §4.20). Aditiva.
ALTER TABLE "MovimentoExtraorcamentario" ADD COLUMN "documentoDoFavorecido" TEXT;
