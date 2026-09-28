-- V22 — a primeira faixa da tabela de redução do IRRF mensal (Lei 9.250/1995 art. 3º-A, incluído
-- pela Lei 15.270/2025): até a renda da faixa isenta, redução de até o máximo, de modo que o imposto
-- devido seja zero. Aditiva: duas colunas opcionais e um CHECK, sem backfill — tabelas já cadastradas
-- continuam com a fórmula linear, e a correção entra por nova vigência cadastrada pelo serviço.

-- AlterTable
ALTER TABLE "TabelaIrrf" ADD COLUMN     "redutorMaximoNaFaixaIsenta" DECIMAL(18,2),
ADD COLUMN     "redutorRendaDaFaixaIsenta" DECIMAL(18,2);

-- Os dois juntos ou nenhum; presentes, só com o redutor linear presente, positivos, e a faixa
-- isenta abaixo da renda máxima do redutor.
ALTER TABLE "TabelaIrrf" ADD CONSTRAINT "TabelaIrrf_redutor_faixa_isenta_chk" CHECK (
  ("redutorRendaDaFaixaIsenta" IS NULL AND "redutorMaximoNaFaixaIsenta" IS NULL)
  OR (
    "redutorRendaDaFaixaIsenta" > 0 AND "redutorMaximoNaFaixaIsenta" > 0
    AND "redutorBase" IS NOT NULL AND "redutorRendaMaxima" IS NOT NULL
    AND "redutorRendaDaFaixaIsenta" < "redutorRendaMaxima"
  )
);
