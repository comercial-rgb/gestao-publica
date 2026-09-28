-- V22 — a ação da Lei Orçamentária Anual (projeto, aprovação e anexos).
--
-- Migration PRÓPRIA, sem tabela nenhuma: `ALTER TYPE ... ADD VALUE` fica sozinho desde a V15.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_LOA';
