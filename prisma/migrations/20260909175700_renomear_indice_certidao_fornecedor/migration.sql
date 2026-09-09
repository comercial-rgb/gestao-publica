-- Deriva do RENOMEIO DA COLUNA `CertidaoFornecedor.documento` -> `contratadoDocumento`,
-- feito num lote anterior: a coluna mudou de nome, o índice não. O banco ficou com um
-- índice cujo nome não corresponde mais ao que ele indexa.
--
-- Não é defeito funcional (o índice serve a mesma consulta), mas é DERIVA: todo
-- `prisma migrate dev --create-only` seguinte reemitia este rename junto com a migration
-- que a pessoa estivesse escrevendo — misturando um conserto antigo com trabalho novo.
-- Fica aqui, sozinho, com o motivo escrito.
ALTER INDEX "CertidaoFornecedor_documento_tipo_validade_idx"
  RENAME TO "CertidaoFornecedor_contratadoDocumento_tipo_validade_idx";
