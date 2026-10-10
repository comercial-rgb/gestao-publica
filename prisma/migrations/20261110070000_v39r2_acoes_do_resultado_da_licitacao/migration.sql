-- V39-R2 (R2-016/017, M11) — as acoes do julgamento e da adjudicacao da licitacao.
--
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e criado, e o Prisma roda
-- cada migration numa transacao (o mesmo motivo da 20261106120000_v36_acoes_das_emendas). Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_RESULTADO_DA_LICITACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'ADJUDICAR_LICITACAO';
