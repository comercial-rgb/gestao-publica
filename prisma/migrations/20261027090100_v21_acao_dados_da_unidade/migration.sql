-- V21 — a ação que declara os dados da unidade orçamentária para a prestação de contas (SAGRES
-- §4.1). Isolada: `ADD VALUE` não pode ser usado na mesma transação em que nasce.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA';
