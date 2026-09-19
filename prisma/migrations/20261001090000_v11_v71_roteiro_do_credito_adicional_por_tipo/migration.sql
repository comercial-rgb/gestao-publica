-- V11 V7.1 — O ROTEIRO DO CRÉDITO ADICIONAL PASSA A SER PARTIDO POR TIPO DE CRÉDITO.
--
-- ═══ O QUE A FONTE DIZ, E POR QUE UMA CONTA SÓ ERA ERRADO ═══
-- `Pcasp_2025.xlsx` do TCE-PB (sha256 52ae7c73...17ffb, o mesmo que `seed:pcasp-oficial`
-- carrega) nomeia a sintética `5.2.2.1.2` assim, literalmente:
--
--     5.2.2.1.2.00.00  DOTAÇÃO ADICIONAL POR TIPO DE CREDITO
--
-- e a parte em três ramos: `.01.00` SUPLEMENTAR, `.02.x` os ESPECIAIS, `.03.x` os
-- EXTRAORDINÁRIOS. O sistema CONHECE o tipo — `LeiCredito.tipoCredito` — mas
-- `RoteiroOrcamentario.tipo` era `@unique` por `TipoMovimentoDotacao`, e `CREDITO_ADICIONAL`
-- é UM tipo de movimento: havia lugar para um roteiro só. Apontá-lo para a suplementar
-- lançaria todo crédito ESPECIAL e EXTRAORDINÁRIO como suplementar.
--
-- ═══ ⚠️ ESTA MIGRATION TEM UM `DROP`, E ELE É DE ÍNDICE, NÃO DE DADO ═══
-- `RoteiroOrcamentario_tipo_key` é a unicidade ANTIGA (por tipo de movimento). Ela é
-- SUBSTITUÍDA por uma mais larga — o par (tipo, tipoCredito) — mais o índice parcial de
-- `prisma/sql/` que fecha o caso NULL. Nenhuma linha é apagada e nenhuma coluna some; o
-- que muda é a forma da restrição, e mantê-la impediria a própria correção. Mesmo
-- procedimento do `20260913090000_v4_cnpj_alfanumerico_nos_checks`, que trocou um CHECK
-- por outro mais largo em migration própria e com o motivo escrito.
--
-- ⚠️ E A SUBSTITUIÇÃO É SEGURA PORQUE A NOVA É MAIS RESTRITIVA OU IGUAL para o que já
-- existe: toda linha existente nasce com `tipoCredito = NULL`, e o índice parcial
-- `uq_roteiro_sem_tipo_de_credito` recria sobre elas exatamente a unicidade por `tipo` que
-- havia antes. Nenhuma janela em que dois `DOTACAO_INICIAL` caibam.

ALTER TABLE "RoteiroOrcamentario" ADD COLUMN "tipoCredito" "TipoCredito";

DROP INDEX "RoteiroOrcamentario_tipo_key";

CREATE UNIQUE INDEX "RoteiroOrcamentario_tipo_tipoCredito_key"
  ON "RoteiroOrcamentario" ("tipo", "tipoCredito");

-- ⚠️ A EQUIVALÊNCIA NOS DOIS SENTIDOS, e é de propósito que ela não é só "crédito
-- adicional exige tipo". Um roteiro de RESERVA com `tipoCredito` preenchido ficaria
-- invisível para a consulta (que procura o par com NULL) e o movimento de reserva cairia
-- com "roteiro não parametrizado" tendo a linha no banco — o pior dos dois mundos.
ALTER TABLE "RoteiroOrcamentario"
  ADD CONSTRAINT "ck_roteiro_tipo_de_credito"
  CHECK (("tipo" = 'CREDITO_ADICIONAL') = ("tipoCredito" IS NOT NULL));
