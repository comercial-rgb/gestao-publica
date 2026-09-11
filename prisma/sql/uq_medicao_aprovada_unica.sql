-- M11 (ENT03b) — uma LIQUIDAÇÃO por medição.
--
-- A medição atesta o que foi executado NO PERÍODO. Duas liquidações sobre a mesma medição
-- pagariam duas vezes o mesmo serviço medido — e o razão ficaria idêntico ao de uma obra
-- que executou o dobro. O acumulado das medições continua sendo conferido contra o
-- contrato pelo caso de uso; esta é a outra ponta, no banco.
--
-- ⚠️ PARCIAL, e por isso não é @unique no modelo: a esmagadora maioria das liquidações
-- (custeio, material, serviço) NÃO tem medição, e um @unique sobre a coluna anulável
-- deixaria apenas UMA liquidação sem medição existir no sistema inteiro.
CREATE UNIQUE INDEX uq_medicao_liquidada_unica
  ON "Liquidacao" ("medicaoId")
  WHERE "medicaoId" IS NOT NULL;
