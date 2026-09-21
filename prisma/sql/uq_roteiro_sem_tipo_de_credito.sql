-- V11 V7.1 — A UNICIDADE QUE O `@@unique` COMPOSTO NÃO DÁ.
-- V11 V8.4 — e ela passou a incluir a VERSÃO.
--
-- `@@unique([tipo, tipoCredito, versao])` vira um índice único comum, e no Postgres dois NULL são
-- DISTINTOS: (DOTACAO_INICIAL, NULL, 1) caberia duas vezes, e a consulta do roteiro passaria a
-- depender de qual linha o planejador devolvesse primeiro — dois roteiros para o mesmo movimento
-- na mesma versão, cada um com a sua conta, e o balancete decidido por sorteio.
--
-- Este índice parcial recria, sobre as linhas sem tipo de crédito, a unicidade por (tipo, versão).
-- O par preenchido já é fechado pelo índice composto.
--
-- ⚠️ A VERSÃO ENTROU JUNTO COM O CADASTRO PELA TELA (V8.4). Sem ela aqui, o ente não conseguiria
-- corrigir o roteiro de `DOTACAO_INICIAL`: a segunda versão colidiria com a primeira, e a recusa
-- viria como violação de índice em vez de motivo — e o roteiro que ele quer trocar é justamente um
-- dos que não têm tipo de crédito.
--
-- ⚠️ PARCIAL, e por isso NÃO é `@unique` no modelo: o Prisma não representa `WHERE`. É a
-- mesma divisão de trabalho de `uq_dotacao_inicial_unica`.
CREATE UNIQUE INDEX uq_roteiro_sem_tipo_de_credito
  ON "RoteiroOrcamentario" ("tipo", "versao")
  WHERE "tipoCredito" IS NULL;
