-- V36 (TR 5.9.3.24) — o bloqueio da anulação da prévia de alteração orçamentária, com roteiro próprio.
ALTER TYPE "TipoMovimentoDotacao" ADD VALUE 'BLOQUEIO_DE_PREVIA';
ALTER TYPE "TipoMovimentoDotacao" ADD VALUE 'BLOQUEIO_DE_PREVIA_LIBERADO';
