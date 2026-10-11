-- V39-R2 (R2-026/028, M36) — as acoes da ordem de abastecimento e da autorizacao da manutencao da frota.
--
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e criado, e o Prisma roda
-- cada migration numa transacao (o mesmo motivo da 20261110110000_v39r2_acoes_da_farmacia). Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'EMITIR_ORDEM_DE_ABASTECIMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'AUTORIZAR_MANUTENCAO_DA_FROTA';
