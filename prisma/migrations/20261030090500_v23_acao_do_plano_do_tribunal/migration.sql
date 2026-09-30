-- V23 — a ação que importa o plano de contas do Tribunal (SAGRES §5.28) para o exercício.
--
-- Migration PRÓPRIA, sem tabela nenhuma: `ALTER TYPE ... ADD VALUE` fica sozinho desde a V15.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'IMPORTAR_PLANO_DO_TRIBUNAL';
