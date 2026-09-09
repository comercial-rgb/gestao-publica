-- M11 — as DUAS DIMENSÕES de um aditivo, e a fronteira entre elas.
--
-- Um movimento contratual mexe em VALOR **ou** em PRAZO — nunca nos dois, nunca
-- em nenhum. O Zod já barra isso na entrada do serviço; este CHECK barra o INSERT
-- DIRETO, que dribla o serviço (e é assim que os dados sujos entram: script de
-- migração, correção manual no banco, seed apressado).
--
-- Sem ele, um ACRESCIMO_VALOR com `dias` preenchido somaria nas DUAS dimensões:
-- o contrato valeria mais E duraria mais, e nenhuma das duas somas acusaria nada
-- (cada Record ignora o que não é dele). O CHECK amarra o tipo à dimensão.
--
-- IDEMPOTENTE: o global-setup dos testes aplica esta pasta a cada rodada, e o
-- banco de teste PERSISTE entre elas. `ADD CONSTRAINT` não tem IF NOT EXISTS no
-- Postgres — daí o bloco DO.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_movimento_contratual_xor'
  ) THEN
    ALTER TABLE "MovimentoContratual"
      ADD CONSTRAINT ck_movimento_contratual_xor CHECK (
        (
          "tipo" IN (
            'ACRESCIMO_VALOR', 'SUPRESSAO_VALOR',
            'ESTORNO_ACRESCIMO_VALOR', 'ESTORNO_SUPRESSAO_VALOR'
          )
          AND "valor" IS NOT NULL AND "valor" > 0 AND "dias" IS NULL
        )
        OR
        (
          "tipo" IN ('PRORROGACAO_PRAZO', 'ESTORNO_PRORROGACAO_PRAZO')
          AND "dias" IS NOT NULL AND "dias" > 0 AND "valor" IS NULL
        )
      );
  END IF;
END $$;
