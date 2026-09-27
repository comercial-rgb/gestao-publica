-- A COMBINAÇÃO DE CONTAS DO ROTEIRO DE RESTOS A PAGAR — o que o Prisma não representa.
--
-- ⚠️ POR QUE UM CHECK, E NÃO UM `if` NO SERVIÇO. São quatro colunas nuláveis cujo sentido
-- depende do `evento` da linha, e coluna nulável assim apodrece: um caminho novo de escrita
-- (seed, importação, correção a mão) gravaria meio par e a recusa apareceria muito depois, como
-- lançamento desequilibrado. O mesmo motivo de `ck_movimento_contratual_xor`.
--
-- AS TRÊS REGRAS, e nenhuma delas é política contábil:
--
--   (1) PAR INTEIRO OU NENHUM. Meio par patrimonial ou meio par de controle não é roteiro
--       incompleto: é roteiro que não fecha. O motor do M01 o recusaria no ato do lançamento,
--       e o ente descobriria o erro de cadastro ao tentar pagar.
--   (2) AO MENOS UM PAR. Linha sem nenhuma conta não configura nada e faria a operação
--       passar por vacuidade.
--   (3) NO PAGAMENTO, O PAR PATRIMONIAL É PROIBIDO — e isto é o CAMINHO DO CÓDIGO, não norma:
--       o débito é o passivo que o dado aponta (a obrigação aberta que a liquidação de origem
--       criou) e o crédito é a conta contábil da conta bancária escolhida no ato. Guardá-los
--       aqui criaria campo que a operação sobrescreve, isto é, campo que mente.
--
-- ⚠️ O QUE ELE NÃO DECIDE: se o CANCELAMENTO tem pernas de DDR, e quais. Isso é do ente com
-- fundamento do TCE. O CHECK permite as duas formas; a ausência de linha é que recusa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_roteiro_restos_pernas'
  ) THEN
    ALTER TABLE "RoteiroRestosAPagar"
      ADD CONSTRAINT ck_roteiro_restos_pernas CHECK (
        -- (1) par patrimonial inteiro ou nenhum
        (("contaDebitoId" IS NULL) = ("contaCreditoId" IS NULL))
        AND
        -- (1) par de controle inteiro ou nenhum
        (("contaControleDebitoId" IS NULL) = ("contaControleCreditoId" IS NULL))
        AND
        -- (2) ao menos um par
        ("contaDebitoId" IS NOT NULL OR "contaControleDebitoId" IS NOT NULL)
        AND
        -- (3) no pagamento, o par patrimonial vem do dado, não do cadastro
        ("evento" <> 'PAGAMENTO' OR "contaDebitoId" IS NULL)
      );
  END IF;
END $$;
