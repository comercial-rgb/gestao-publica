-- M16 — nova ação TRANSFERIR_ENTRE_CONTAS no enum AcaoDoSistema (TR 5.61).
-- SEPARADA de propósito: ALTER TYPE ... ADD VALUE num enum EXISTENTE não pode compartilhar
-- transação com DDL que USE o novo valor. Aqui ela vem sozinha (doutrina do projeto).
ALTER TYPE "AcaoDoSistema" ADD VALUE 'TRANSFERIR_ENTRE_CONTAS';
