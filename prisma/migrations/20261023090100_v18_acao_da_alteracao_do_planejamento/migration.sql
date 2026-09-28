-- V18/C13 — a acao do ATO QUE ALTERA a peca de planejamento (TR 5.9.1.30 · 5.9.2.18).
--
-- Migration PROPRIA, e nao junto das tabelas: `ALTER TYPE ... ADD VALUE` nao pode ser usado
-- na mesma transacao em que o tipo e criado ou alterado, e o Prisma roda cada migration numa
-- transacao. Foi a licao da V15 (`20261020090100_v15_acao_do_roteiro_dos_restos_a_pagar`) e a
-- pratica da V16.
--
-- ⚠️ `AcaoDoSistema` e enum do Prisma E uniao do TypeScript. Declarar so a uniao derruba o
-- typecheck do projeto inteiro; declarar so o enum deixa a acao inalcancavel pelo censo.
--
-- ⚠️ UMA ACAO PARA AS DUAS PECAS E PARA OS DOIS SERVICOS (registrar o ato, acrescentar item),
-- e ela NAO acompanha CADASTRAR_PPA nem CADASTRAR_LDO: digitar a peca que o Executivo monta e
-- assinar a lei que altera a peca aprovada sao autoridades diferentes no ente.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'ALTERAR_PLANEJAMENTO';
