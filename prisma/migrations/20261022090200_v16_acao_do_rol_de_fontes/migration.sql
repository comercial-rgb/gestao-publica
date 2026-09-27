-- V16 — a acao do ROL DE FONTES da conta bancaria (TR 5.10.2.6).
--
-- Migration propria, como a anterior: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma
-- transacao em que e criado, e o Prisma roda cada migration numa transacao.
--
-- ⚠️ POR QUE A ACAO NASCE AGORA. O vinculo `FonteDaContaBancaria` existe desde 2026-09-10 (a ADR
-- da conta multifonte) e nunca teve CADASTRO: a pendencia `ROL-DE-FONTES-UI` estava no catalogo.
-- Enquanto cada conta tinha uma fonte so, a ausencia nao impedia nada. A guia REPARTIDA entre
-- fontes (C30) a tornou bloqueante: um deposito que pertence a duas fontes so entra numa conta
-- que comporte as duas.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'GERIR_ROL_DE_FONTES_DA_CONTA';
