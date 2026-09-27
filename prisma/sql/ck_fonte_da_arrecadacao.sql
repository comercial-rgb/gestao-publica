-- V16/C30 — o que o Prisma nao representa na parcela de fonte da arrecadacao.
--
-- (1) valor > 0. Parcela de zero nao reparte nada e parcela negativa faria a soma fechar com uma
--     fonte "devolvendo" dinheiro que nunca entrou nela.
-- (2) fonte NAO prevista na LOA exige FUNDAMENTO escrito (10 caracteres uteis, a mesma regra do
--     motivo do estorno bancario). E o que a prestacao de contas le, e e o que separa uma
--     alteracao fundamentada de um palpite. A autorizacao nomeada
--     (`DISTRIBUIR_RECEITA_FORA_DA_PREVISAO`) e conferida no servidor; este CHECK garante que
--     nenhum caminho — importador, script, INSERT de manutencao — grave a parcela sem o motivo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fonte_da_arrecadacao_valor'
  ) THEN
    ALTER TABLE "FonteDaArrecadacao"
      ADD CONSTRAINT "ck_fonte_da_arrecadacao_valor" CHECK ("valor" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fonte_da_arrecadacao_fundamento'
  ) THEN
    ALTER TABLE "FonteDaArrecadacao"
      ADD CONSTRAINT "ck_fonte_da_arrecadacao_fundamento" CHECK (
        "previstaNaLoa"
        OR ("fundamento" IS NOT NULL AND length(btrim("fundamento")) >= 10)
      );
  END IF;
END $$;
