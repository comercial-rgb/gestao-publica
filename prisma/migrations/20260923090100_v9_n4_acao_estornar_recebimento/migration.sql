-- V9 N4 — a ação de estornar o recebimento definitivo. Aditiva: um valor de enum, zero DROP.
--
-- ⚠️ AÇÃO PRÓPRIA, e não a mesma de receber: desfazer um termo assinado é excepcional e reabre
-- quantidade já fechada. Pendurá-la em REGISTRAR_RECEBIMENTO_DEFINITIVO daria o poder de desfazer
-- a todo mundo que pode receber, em silêncio, no dia em que a funcionalidade entrasse.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ESTORNAR_RECEBIMENTO_DEFINITIVO';
