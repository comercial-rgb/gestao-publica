-- V39-R2 (R2-023, M02b) — a versão do projeto da LOA aponta a proposta orçamentária que leva, e cada linha da cópia aponta
-- a linha da proposta de que veio. Aditiva: três colunas anuláveis (as versões anteriores ficam sem a ligação), as FKs
-- (RESTRICT: a cópia guardada não muda por exclusão do que ela aponta) e os índices de leitura do comparativo.
-- AlterTable
ALTER TABLE "DotacaoDoProjetoDaLoa" ADD COLUMN     "linhaDaPropostaId" TEXT;
-- AlterTable
ALTER TABLE "ReceitaDoProjetoDaLoa" ADD COLUMN     "linhaDaPropostaId" TEXT;
-- AlterTable
ALTER TABLE "VersaoDoProjetoDaLoa" ADD COLUMN     "propostaOrcamentariaId" TEXT;
-- AddForeignKey
ALTER TABLE "VersaoDoProjetoDaLoa" ADD CONSTRAINT "VersaoDoProjetoDaLoa_propostaOrcamentariaId_fkey" FOREIGN KEY ("propostaOrcamentariaId") REFERENCES "PropostaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DotacaoDoProjetoDaLoa" ADD CONSTRAINT "DotacaoDoProjetoDaLoa_linhaDaPropostaId_fkey" FOREIGN KEY ("linhaDaPropostaId") REFERENCES "LinhaDeDespesaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ReceitaDoProjetoDaLoa" ADD CONSTRAINT "ReceitaDoProjetoDaLoa_linhaDaPropostaId_fkey" FOREIGN KEY ("linhaDaPropostaId") REFERENCES "LinhaDeReceitaDaProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- CreateIndex
CREATE INDEX "VersaoDoProjetoDaLoa_propostaOrcamentariaId_idx" ON "VersaoDoProjetoDaLoa"("propostaOrcamentariaId");
-- CreateIndex
CREATE INDEX "DotacaoDoProjetoDaLoa_linhaDaPropostaId_idx" ON "DotacaoDoProjetoDaLoa"("linhaDaPropostaId");
-- CreateIndex
CREATE INDEX "ReceitaDoProjetoDaLoa_linhaDaPropostaId_idx" ON "ReceitaDoProjetoDaLoa"("linhaDaPropostaId");
