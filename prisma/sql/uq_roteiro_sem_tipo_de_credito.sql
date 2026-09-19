-- V11 V7.1 — A UNICIDADE QUE O `@@unique` COMPOSTO NÃO DÁ.
--
-- `@@unique([tipo, tipoCredito])` vira um índice único comum, e no Postgres dois NULL são
-- DISTINTOS: (DOTACAO_INICIAL, NULL) caberia duas vezes, e a consulta do roteiro passaria a
-- depender de qual linha o planejador devolvesse primeiro — dois roteiros para o mesmo
-- movimento, cada um com a sua conta, e o balancete decidido por sorteio.
--
-- Este índice parcial recria, sobre as linhas sem tipo de crédito, exatamente a unicidade
-- por `tipo` que existia antes da V7.1. O par preenchido já é fechado pelo índice composto.
--
-- ⚠️ PARCIAL, e por isso NÃO é `@unique` no modelo: o Prisma não representa `WHERE`. É a
-- mesma divisão de trabalho de `uq_dotacao_inicial_unica`.
CREATE UNIQUE INDEX uq_roteiro_sem_tipo_de_credito
  ON "RoteiroOrcamentario" ("tipo")
  WHERE "tipoCredito" IS NULL;
