-- V38 (M02) — a linha da proposta orçamentária ou VEM da lei de origem ou é NOVA, nunca as duas nem nenhuma.
--
-- A linha importada aponta para a ficha (ou a receita prevista) de origem; a linha nova (a ficha ou a receita que a
-- lei de origem não tinha) carrega a própria classificação. O Zod do serviço já exige uma das duas formas; estes
-- CHECKs barram o INSERT DIRETO (script, correção à mão, seed), que é por onde o dado sujo entraria: uma linha sem
-- origem e sem classificação não vira ficha na efetivação e some do orçamento em silêncio.
--
-- IDEMPOTENTE: o global-setup dos testes aplica esta pasta a cada rodada, e o banco de teste PERSISTE entre elas.
-- `ADD CONSTRAINT` não tem IF NOT EXISTS no Postgres — daí o bloco DO.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_linha_de_despesa_da_proposta_origem_ou_nova') THEN
    ALTER TABLE "LinhaDeDespesaDaProposta"
      ADD CONSTRAINT ck_linha_de_despesa_da_proposta_origem_ou_nova CHECK (
        (
          "fichaDeOrigemId" IS NOT NULL
          AND "unidadeOrcId" IS NULL AND "funcaoId" IS NULL AND "subfuncaoId" IS NULL AND "programaId" IS NULL
          AND "acaoId" IS NULL AND "naturezaDespesaId" IS NULL AND "fonteId" IS NULL
        )
        OR
        (
          "fichaDeOrigemId" IS NULL
          AND "orgaoId" IS NOT NULL AND "unidadeOrcId" IS NOT NULL AND "funcaoId" IS NOT NULL AND "subfuncaoId" IS NOT NULL
          AND "programaId" IS NOT NULL AND "acaoId" IS NOT NULL AND "naturezaDespesaId" IS NOT NULL AND "fonteId" IS NOT NULL
          AND "exercicioFonte" IS NOT NULL AND "motivo" IS NOT NULL AND "criadoPor" IS NOT NULL
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_linha_de_receita_da_proposta_origem_ou_nova') THEN
    ALTER TABLE "LinhaDeReceitaDaProposta"
      ADD CONSTRAINT ck_linha_de_receita_da_proposta_origem_ou_nova CHECK (
        (
          "receitaDeOrigemId" IS NOT NULL
          AND "naturezaReceitaId" IS NULL AND "fonteId" IS NULL AND "tipoReceita" IS NULL
        )
        OR
        (
          "receitaDeOrigemId" IS NULL
          AND "naturezaReceitaId" IS NOT NULL AND "fonteId" IS NOT NULL AND "exercicioFonte" IS NOT NULL
          AND "tipoReceita" IS NOT NULL AND "motivo" IS NOT NULL AND "criadoPor" IS NOT NULL
        )
      );
  END IF;
END $$;
