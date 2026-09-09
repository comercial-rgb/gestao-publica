-- Uma ficha tem NO MÁXIMO uma DOTACAO_INICIAL.
--
-- POR QUE ÍNDICE, E NÃO CHECAGEM NA TRANSAÇÃO:
-- a checagem `count() == 0` dentro da transação (que é o que
-- `garantirDotacaoInicial` faz) NÃO fecha a corrida sob READ COMMITTED: duas
-- transações concorrentes podem ler zero e ambas inserir. O resultado seria uma
-- ficha com a dotação CONTADA DUAS VEZES no saldoAutorizado — dinheiro que não
-- existe, aparecendo no orçamento. O índice único vê sempre.
--
-- Índice PARCIAL (só onde tipo = DOTACAO_INICIAL) porque os demais tipos de
-- movimento se repetem à vontade na mesma ficha — o que não pode repetir é a
-- dotação inicial.
--
-- Prisma não expressa índices parciais nem WHERE com enum; por isso vive aqui,
-- no padrão do projeto (prisma/sql/), e é ignorado no diff (sem drift).
CREATE UNIQUE INDEX uq_dotacao_inicial_unica
  ON "MovimentoDotacao" ("fichaId")
  WHERE "tipo" = 'DOTACAO_INICIAL';
