-- V7 M1 U3 — o rastro do ajuste aponta para a linha de anulação do M05 com FK (o banco garante que ela existe).
-- AddForeignKey
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "AjusteDosEncargos_anulacaoDeEmpenhoId_fkey" FOREIGN KEY ("anulacaoDeEmpenhoId") REFERENCES "Empenho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteDosEncargos" ADD CONSTRAINT "AjusteDosEncargos_anulacaoDeLiquidacaoId_fkey" FOREIGN KEY ("anulacaoDeLiquidacaoId") REFERENCES "Liquidacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

