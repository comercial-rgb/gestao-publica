-- V6 P1.1 — movimento INFORMATIVO da solicitação: uma ordem que a atendia foi estornada.
-- Separado da tabela: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "TipoMovimentoDaSolicitacao" ADD VALUE 'ORDEM_ESTORNADA';
