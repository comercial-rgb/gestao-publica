-- V36 — as acoes das EMENDAS ao projeto da LOA (TR 5.9.3.13 a 5.9.3.15).
--
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e
-- criado, e o Prisma roda cada migration numa transacao.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_EMENDA_AO_ORCAMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'SANCIONAR_EMENDA_AO_ORCAMENTO';
