-- V10 T3 (N2) — o HISTÓRICO da política de divulgação de uma localização física. Aditiva: uma
-- tabela, zero DROP, zero backfill, zero alteração de coluna existente.
--
-- ⚠️ POR QUE UM FATO, E NÃO SÓ O `UPDATE` DA COLUNA que já existe. Marcar uma localização como
-- divulgável é decidir que "sala do cofre da tesouraria" passa a aparecer num portal público.
-- A coluna booleana responde "está divulgável hoje" e nada mais: quem decidiu, quando e por quê
-- ficam de fora — e são exatamente as três perguntas que se faz depois de um vazamento.
--
-- ⚠️ APPEND-ONLY. `de` e `para` guardam o estado antes e depois, para que o histórico se leia
-- sem reconstruir nada. Ligar e desligar são dois fatos, e os dois ficam.
CREATE TABLE "MudancaDaDivulgacaoDaLocalizacao" (
    "id" TEXT NOT NULL,
    "localizacaoId" TEXT NOT NULL,
    "de" BOOLEAN NOT NULL,
    "para" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MudancaDaDivulgacaoDaLocalizacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MudancaDaDivulgacaoDaLocalizacao_localizacaoId_criadoEm_idx" ON "MudancaDaDivulgacaoDaLocalizacao"("localizacaoId", "criadoEm");

ALTER TABLE "MudancaDaDivulgacaoDaLocalizacao" ADD CONSTRAINT "MudancaDaDivulgacaoDaLocalizacao_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "LocalizacaoFisica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
