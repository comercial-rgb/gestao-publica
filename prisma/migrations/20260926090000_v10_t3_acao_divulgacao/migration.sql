-- V10 T3 (N2) — a ação de definir a política de divulgação de uma localização. Aditiva.
--
-- ⚠️ ARQUIVO PRÓPRIO PARA O VALOR DE ENUM, e não junto da tabela. A razão está escrita em
-- `20260924090200_v10_t2_acoes_tributarias`: regerar a migration das tabelas contra um banco de
-- desenvolvimento que já tinha os valores os fez desaparecer do arquivo em silêncio, e o banco
-- de teste quebrou longe dali.
--
-- ⚠️ AÇÃO PRÓPRIA, e não `CADASTRAR_LOCALIZACAO_FISICA`: quem cadastra o depósito não é
-- necessariamente quem decide o que vai ao portal público do município.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DEFINIR_DIVULGACAO_DA_LOCALIZACAO';
