-- V11 V8.8 — A DIMENSÃO DA ABERTURA NA CHAVE DO ROTEIRO (`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA`)
--
-- O PCASP parte o ramo do crédito ESPECIAL e do EXTRAORDINÁRIO em ABERTOS e REABERTOS — contas
-- diferentes, e é essa diferença que o TCE lê. O roteiro era chaveado por (movimento, tipo de
-- crédito) e por isso um crédito REABERTO lançava na MESMA conta de um ABERTO.
--
-- ADITIVA, e sem um único DROP: um tipo novo, uma coluna nova, um índice novo e um CHECK. O
-- índice único de (tipo, tipoCredito, versao) FICA COMO ESTÁ — a versão continua sendo a
-- sequência das decisões do ente sobre aquele tipo de crédito, e a abertura não entra nela.
-- Publicar o ABERTO e depois o REABERTO dá v1 e v2; a vigente de cada um é a maior versão COM A
-- SUA abertura. Foi assim que esta migração não precisou derrubar nada.
CREATE TYPE "AberturaDoCredito" AS ENUM ('ABERTO', 'REABERTO');

ALTER TABLE "RoteiroOrcamentario" ADD COLUMN "abertura" "AberturaDoCredito";

CREATE INDEX "RoteiroOrcamentario_tipo_tipoCredito_abertura_versao_idx"
    ON "RoteiroOrcamentario"("tipo", "tipoCredito", "abertura", "versao");

-- ⚠️ A ABERTURA SÓ EXISTE ONDE ELA SIGNIFICA ALGUMA COISA.
--
-- A CF art. 167 § 2º alcança o especial e o extraordinário; o SUPLEMENTAR reforça dotação que já
-- existe e morre com o exercício — ele não se reabre, e o plano não o parte. Uma abertura numa
-- linha de RESERVA, de DOTACAO_INICIAL ou de crédito suplementar criaria uma chave que nenhuma
-- leitura procura: a linha ficaria no banco parecendo configuração e o movimento continuaria
-- sendo recusado, sem ninguém entender por quê.
--
-- ⚠️ E ELA NÃO É OBRIGATÓRIA NAS LINHAS DE ESPECIAL/EXTRAORDINÁRIO, de propósito: as linhas
-- publicadas ANTES desta dimensão existirem não têm abertura para declarar, e carimbar uma nelas
-- seria inventar uma decisão que ninguém tomou. Quem as recusa é a LEITURA do razão, que passou a
-- ser fail-closed por abertura e nomeia a que falta.
ALTER TABLE "RoteiroOrcamentario" ADD CONSTRAINT "ck_roteiro_abertura_so_de_credito_reabrivel" CHECK (
    "abertura" IS NULL
    OR ("tipo" = 'CREDITO_ADICIONAL' AND "tipoCredito" IN ('ESPECIAL', 'EXTRAORDINARIO'))
);
