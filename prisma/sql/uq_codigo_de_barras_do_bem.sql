-- ENT05 — duas etiquetas com o MESMO código de barras leriam como o mesmo bem.
--
-- A coluna é ANULÁVEL de propósito: bem antigo, cadastrado antes da etiqueta existir,
-- não tem código — e exigir um obrigaria a inventar um para o acervo inteiro.
--
-- ⚠️ E É POR SER ANULÁVEL QUE O `@unique` DO PRISMA NÃO SERVE AQUI. Ele criaria um índice
-- único comum, que restringe os valores presentes mas NÃO os NULL (dois NULL são
-- distintos no Postgres) — o que é o comportamento desejado. O problema é outro, e é de
-- processo: `prisma migrate dev` pede confirmação interativa para adicionar unique a
-- coluna existente, e o índice parcial declarado aqui expressa a MESMA regra sem
-- depender de um prompt que ninguém vai ver no gate.
--
-- Índice único PARCIAL (o Prisma não representa índices parciais e os ignora no diff).
CREATE UNIQUE INDEX uq_codigo_de_barras_do_bem
  ON "BemPatrimonial" ("codigoDeBarras")
  WHERE "codigoDeBarras" IS NOT NULL;
