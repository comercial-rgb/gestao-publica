-- V6.1 — as duas contas patrimoniais da liquidação da folha, declaradas pelo ENTE no grupo.
-- ADITIVA e NULLABLE: nenhum backfill inventa conta para grupo já gravado; o fail-closed vive na
-- liquidação, que recusa nomeando o grupo. Zero DROP.

-- AlterTable
ALTER TABLE "GrupoDeEmpenhoDaFolha" ADD COLUMN     "contaObrigacaoId" TEXT,
ADD COLUMN     "contaVariacaoId" TEXT;

-- AddForeignKey
ALTER TABLE "GrupoDeEmpenhoDaFolha" ADD CONSTRAINT "GrupoDeEmpenhoDaFolha_contaVariacaoId_fkey" FOREIGN KEY ("contaVariacaoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoDeEmpenhoDaFolha" ADD CONSTRAINT "GrupoDeEmpenhoDaFolha_contaObrigacaoId_fkey" FOREIGN KEY ("contaObrigacaoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

