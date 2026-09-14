-- V7 M1 U4 — triagem da ouvidoria e moderação das avaliações. SEPARADA das tabelas (ALTER TYPE ADD VALUE).
ALTER TYPE "AcaoDoSistema" ADD VALUE 'TRIAR_MANIFESTACAO_DE_OUVIDORIA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'MODERAR_AVALIACAO_DE_SERVICO';
