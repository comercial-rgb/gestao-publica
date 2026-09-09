-- CreateEnum
CREATE TYPE "TipoObraServico" AS ENUM ('SERVICOS_DIVERSOS_SUJEITOS_A_RETENCAO', 'TRANSPORTE_DE_PASSAGEIROS_POR_PF', 'LIMPEZA_HOSPITALAR', 'DEMAIS_LIMPEZAS', 'PAVIMENTACAO_ASFALTICA', 'TERRAPLANAGEM_ATERRO_SANITARIO_E_DRAGAGEM', 'OBRAS_DE_ARTE', 'DRENAGEM', 'DEMAIS_SERVICOS_DE_CONSTRUCAO_CIVIL_COM_EQUIPAMENTOS', 'EDIFICACOES_EM_GERAL');

-- AlterTable
ALTER TABLE "Empenho" ADD COLUMN     "obraId" TEXT;

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipoObraServico" "TipoObraServico" NOT NULL,
    "cei" VARCHAR(12),
    "orgaoId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Obra_identificador_key" ON "Obra"("identificador");

-- CreateIndex
CREATE INDEX "Obra_orgaoId_idx" ON "Obra"("orgaoId");

-- CreateIndex
CREATE INDEX "Obra_ativa_idx" ON "Obra"("ativa");

-- AddForeignKey
ALTER TABLE "Empenho" ADD CONSTRAINT "Empenho_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
