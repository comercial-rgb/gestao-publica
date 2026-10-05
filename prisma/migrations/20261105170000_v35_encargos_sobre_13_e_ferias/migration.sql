-- V35 — encargos patronais sobre o 13º e as férias apropriados (MCASP 11ª ed., Parte II, 18.3). Aditiva.
ALTER TYPE "TipoDaApropriacaoDePessoal" ADD VALUE 'ENCARGOS_DECIMO_TERCEIRO';
ALTER TYPE "TipoDaApropriacaoDePessoal" ADD VALUE 'ENCARGOS_FERIAS';

ALTER TABLE "ItemDaApropriacaoPorCompetencia" ADD COLUMN "aliquotaDosEncargos" DECIMAL(9,6);
