-- V6 P2.3 — a MUDANÇA DE REGIME PREVIDENCIÁRIO é evento do vínculo (M32), porque a folha de cada
-- competência aplica o regime vigente NAQUELA competência: quem migrou ao RPPS em junho contribuiu
-- ao RGPS em maio, e o recálculo de maio tem de usar a tabela de maio.
-- SEPARADA da coluna: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "TipoEventoVinculo" ADD VALUE 'MUDANCA_REGIME_PREVIDENCIARIO';
