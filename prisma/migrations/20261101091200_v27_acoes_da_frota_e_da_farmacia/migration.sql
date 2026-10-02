-- V27 — as ações da frota (M36) e da farmácia pública (M37). Migration própria, sem tabela: ALTER TYPE ... ADD VALUE
-- fica sozinho (desde a V15).

ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_FROTA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_ABASTECIMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_FARMACIA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'INFORMAR_ESTOQUE_DA_FARMACIA';
