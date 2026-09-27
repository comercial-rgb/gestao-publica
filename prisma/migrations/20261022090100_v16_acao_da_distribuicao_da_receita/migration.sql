-- V16 — a acao da "alteracao autorizada no ato" (C30).
--
-- Migration PROPRIA, e nao junto da tabela: `ALTER TYPE ... ADD VALUE` nao pode ser usado na
-- mesma transacao em que e criado, e o Prisma roda cada migration numa transacao. Foi a licao da
-- V15 (`20261020090100_v15_acao_do_roteiro_dos_restos_a_pagar`).
--
-- ⚠️ `AcaoDoSistema` e enum do Prisma E uniao do TypeScript. Declarar so a uniao derruba o
-- typecheck do projeto inteiro; declarar so o enum deixa a acao inalcancavel pelo censo.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'DISTRIBUIR_RECEITA_FORA_DA_PREVISAO';
