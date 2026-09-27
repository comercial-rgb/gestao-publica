-- V16 — A GUIA REPARTIDA ENTRE FONTES DE RECURSO (C30)
--
-- Aditiva: uma tabela nova. Zero DROP, nenhuma coluna existente tocada, nenhum enum alterado,
-- e a `uq_receita_guia` continua exatamente como estava.
--
-- ⚠️ POR QUE ELA E NECESSARIA. `ReceitaArrecadada.fonteId` e NOT NULL e singular, e a chave da
-- guia e `[exercicio, numeroReceita, tipo]`: um numero de guia produz UMA linha com UMA fonte.
-- Um deposito unico repartido entre fontes nao tinha como ser registrado sem inventar numero de
-- documento. E a perna de CLASSE 7 da DDR sai da natureza DA FONTE, entao o total inteiro era
-- carimbado numa unica natureza de destinacao — o erro sai no RGF Anexo 5, nao no cadastro.
--
-- ⚠️ A CONSERVACAO DO TOTAL NAO ESTA AQUI, e nao podia estar: soma de linhas nao e CHECK. Ela
-- mora no motor de partidas dobradas — uma perna de classe 7 por natureza, cada uma com o seu
-- valor, contra uma perna de classe 8 com o total, e `validarLancamento` exige que o subsistema
-- CONTROLE feche. Parcelas que nao somam o total nao produzem lancamento, logo nao produzem guia.
--
-- ⚠️ `ON DELETE RESTRICT` nas duas pontas, DECLARADO tambem no schema — a licao da V15: o Prisma
-- assume `SET NULL` quando ninguem declara, e a divergencia aparece como remocao silenciosa no
-- `npm run deriva`. As duas colunas sao NOT NULL e a guia e append-only: nada apaga uma guia,
-- logo a parcela nunca precisa ser levada junto.
--
-- ⚠️ O CHECK mora em `prisma/sql/ck_fonte_da_arrecadacao.sql`, nao aqui — um dono por objeto.

CREATE TABLE "FonteDaArrecadacao" (
    "id"                  TEXT NOT NULL,
    "receitaArrecadadaId" TEXT NOT NULL,
    "fonteId"             TEXT NOT NULL,
    "exercicioFonte"      INTEGER NOT NULL DEFAULT 1,
    "valor"               DECIMAL(18,2) NOT NULL,
    "previstaNaLoa"       BOOLEAN NOT NULL,
    "fundamento"          TEXT,
    "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor"           TEXT NOT NULL,

    CONSTRAINT "FonteDaArrecadacao_pkey" PRIMARY KEY ("id")
);

-- A mesma fonte nao entra duas vezes na mesma guia: duas parcelas da mesma fonte sao uma so, e
-- manter as duas faria a soma por fonte depender da ordem de leitura.
CREATE UNIQUE INDEX "FonteDaArrecadacao_receitaArrecadadaId_fonteId_exercicioFonte_key"
    ON "FonteDaArrecadacao"("receitaArrecadadaId", "fonteId", "exercicioFonte");
CREATE INDEX "FonteDaArrecadacao_fonteId_idx" ON "FonteDaArrecadacao"("fonteId");

ALTER TABLE "FonteDaArrecadacao" ADD CONSTRAINT "FonteDaArrecadacao_receitaArrecadadaId_fkey"
  FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FonteDaArrecadacao" ADD CONSTRAINT "FonteDaArrecadacao_fonteId_fkey"
  FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
