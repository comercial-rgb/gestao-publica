-- V39-R3 (R3-013, M36) — A AUTORIZACAO PARA CONDUZIR CICLOMOTOR (ACC) como categoria propria do condutor da frota.
--
-- A ACC e a habilitacao do ciclomotor (CTB art. 140; Resolucao CONTRAN 168/2004), e nao uma letra combinada: lida letra
-- a letra ela viraria A, C, C. A coluna passa de 2 para 3 caracteres e o CHECK aceita ACC.
--
-- ISTO E UMA AMPLIACAO, NAO UMA ELIMINACAO DE DADOS: nenhuma linha e apagada, a coluna so cresce, e todo valor que o
-- CHECK antigo aceitava continua aceito. O DROP e do CHECK antigo, para dar lugar ao mais largo (a unica forma de
-- ampliar um CHECK no Postgres), como na 20260913090000_v4_cnpj_alfanumerico_nos_checks.
ALTER TABLE "VersaoDoCondutor" ALTER COLUMN "cnhCategoria" TYPE VARCHAR(3);
ALTER TABLE "VersaoDoCondutor" DROP CONSTRAINT IF EXISTS "ck_versao_do_condutor";
ALTER TABLE "VersaoDoCondutor" ADD CONSTRAINT "ck_versao_do_condutor" CHECK ("versao" >= 1 AND "cnhCategoria" ~ '^(A|B|C|D|E|AB|AC|AD|AE|ACC)$');
