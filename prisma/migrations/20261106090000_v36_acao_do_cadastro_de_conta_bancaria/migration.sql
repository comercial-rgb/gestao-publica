-- V36 — a acao do CADASTRO de conta bancaria (TR 5.10.2.6).
--
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e
-- criado, e o Prisma roda cada migration numa transacao.
--
-- Ate a V36 nenhuma conta bancaria nascia pela tela: so o semeador e os testes a criavam.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_CONTA_BANCARIA';
