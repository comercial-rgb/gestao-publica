-- V11 V9.1 — OS VALORES NOVOS DOS DOIS ENUMS, E NADA MAIS NESTE ARQUIVO.
--
-- ⚠️ ESTA MIGRATION EXISTE SEPARADA POR UMA RESTRIÇÃO DO POSTGRES, NÃO POR ESTILO. Um valor
-- acrescentado a um tipo enumerado NÃO PODE SER USADO na mesma transação que o acrescentou
-- ("unsafe use of new value of enum type"). O Prisma roda cada arquivo de migration numa
-- transação — então a migration que CRIA as tabelas que referenciam
-- 'ABATIMENTO_DO_ADIANTAMENTO_DO_13', e qualquer CHECK que cite os tipos novos de folha,
-- precisa ser um arquivo DEPOIS deste. Juntar as duas falha na aplicação, não no code review.
--
-- ADITIVA: três valores novos. Nenhum valor existente muda de nome ou sai, nenhuma linha é
-- reescrita, e todo banco em produção continua lendo 'MENSAL' exatamente como antes.

-- Os dois tipos de folha do 13º (TR 5.12.50). A folha de DIFERENÇA de 13º que o mesmo item
-- enumera NÃO entra aqui: ela está declarada ausente, e um valor de enum sem motor por trás
-- seria uma opção de tela que recusa ao ser escolhida.
ALTER TYPE "TipoDeFolha" ADD VALUE 'ADIANTAMENTO_DECIMO_TERCEIRO';
ALTER TYPE "TipoDeFolha" ADD VALUE 'DECIMO_TERCEIRO';

-- A única natureza nova. O valor da linha vem de OUTRA folha (o provento do adiantamento já
-- fechado), e é por isso que ela não pode ser uma fórmula do ente: `packages/formula` é universo
-- fechado sobre o contracheque corrente. O motor MENSAL cai no `default` do switch e a ignora.
ALTER TYPE "NaturezaDaRubrica" ADD VALUE 'ABATIMENTO_DO_ADIANTAMENTO_DO_13';
