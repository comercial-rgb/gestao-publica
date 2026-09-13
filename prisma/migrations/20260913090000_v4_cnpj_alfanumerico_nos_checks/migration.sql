-- Sessão noturna V4 (§7) — o CNPJ ALFANUMÉRICO (Receita Federal, julho de 2026): doze caracteres
-- [A-Z0-9] e dois dígitos verificadores numéricos. O CPF continua numérico.
--
-- ⚠️ ISTO É UMA ALTERAÇÃO DE CONSTRAINT, NÃO UMA ELIMINAÇÃO DE DADOS. Os dois CHECKs abaixo
-- ACEITAVAM só dígitos; passam a aceitar também o CNPJ alfanumérico. Nenhuma linha é apagada,
-- nenhuma coluna muda de tipo, e todo valor que o CHECK antigo aceitava continua aceito (o
-- numérico é o subconjunto sem letras). O DROP é do CHECK antigo, para dar lugar ao mais largo
-- — a única forma de ampliar um CHECK no Postgres. Justificativa: sem isto, um fornecedor com
-- CNPJ alfanumérico não pode ter contrato nem certidão cadastrados.
ALTER TABLE "Contrato" DROP CONSTRAINT IF EXISTS "ck_contrato_contratado_documento_formato";
ALTER TABLE "Contrato"
  ADD CONSTRAINT "ck_contrato_contratado_documento_formato"
  CHECK ("contratadoDocumento" ~ '^[0-9]{11}$' OR "contratadoDocumento" ~ '^[A-Z0-9]{12}[0-9]{2}$');

ALTER TABLE "CertidaoFornecedor" DROP CONSTRAINT IF EXISTS "ck_certidao_documento_formato";
ALTER TABLE "CertidaoFornecedor"
  ADD CONSTRAINT "ck_certidao_documento_formato"
  CHECK ("contratadoDocumento" ~ '^[0-9]{11}$' OR "contratadoDocumento" ~ '^[A-Z0-9]{12}[0-9]{2}$');
