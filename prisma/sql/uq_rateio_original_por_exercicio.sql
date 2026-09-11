-- M30 — UM contrato de rateio ORIGINAL por consórcio e exercício (Lei 11.107, art. 8º).
--
-- O teto do exercício é a soma do original com os aditivos. Dois "originais" de 2026
-- dobrariam o teto sem que nada acusasse: o guard do repasse somaria os dois e
-- autorizaria o dobro da cota que o contrato assinado fixou.
--
-- É PARCIAL porque os ADITIVOS (com `aditivoDeId` não nulo) podem ser vários — e devem:
-- o aditivo é a forma legítima de mudar a cota no meio do exercício.
CREATE UNIQUE INDEX uq_rateio_original_por_exercicio
  ON "ContratoDeRateio" ("consorcioId", "exercicio")
  WHERE "aditivoDeId" IS NULL;
