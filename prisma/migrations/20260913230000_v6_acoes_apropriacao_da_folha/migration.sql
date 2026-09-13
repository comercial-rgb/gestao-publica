-- V6 P2.3b — a apropriação contábil da folha fechada (TR 5.12.71/72): duas ações.
-- APROPRIAR_FOLHA é o ato de transformar a competência fechada em despesa; quem o faz precisa
-- TAMBÉM de EMPENHAR (o M05 exige a sua própria ação dentro da transação de cada empenho), e é
-- assim que a segregação continua valendo — apropriar não é um atalho para empenhar.
-- SEPARADA das tabelas: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'APROPRIAR_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA';
