-- V27 — a lei orçamentária publicada se registra (com o PDF) antes do comprovante do banco de legislação do TCE-PB;
-- o protocolo chega depois, como fato próprio. Nenhum dado é apagado: o protocolo deixa de ser obrigatório no
-- registro da norma (o CHECK de formato continua valendo quando ele existe) e ganha a tabela do fato posterior.

-- AlterTable
ALTER TABLE "NormaOrcamentariaNoTce" ALTER COLUMN "protocoloTce" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProtocoloDaNormaNoTce" (
    "id" TEXT NOT NULL,
    "normaId" TEXT NOT NULL,
    "protocoloTce" VARCHAR(9) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProtocoloDaNormaNoTce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProtocoloDaNormaNoTce_normaId_key" ON "ProtocoloDaNormaNoTce"("normaId");

-- AddForeignKey
ALTER TABLE "ProtocoloDaNormaNoTce" ADD CONSTRAINT "ProtocoloDaNormaNoTce_normaId_fkey" FOREIGN KEY ("normaId") REFERENCES "NormaOrcamentariaNoTce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Anexo" ADD COLUMN     "normaOrcamentariaId" TEXT;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_normaOrcamentariaId_fkey" FOREIGN KEY ("normaOrcamentariaId") REFERENCES "NormaOrcamentariaNoTce"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECKs: o formato do protocolo no fato posterior, e o fundamento (o comprovante) obrigatório.
ALTER TABLE "ProtocoloDaNormaNoTce" ADD CONSTRAINT "ProtocoloDaNormaNoTce_protocolo_check" CHECK ("protocoloTce" ~ '^[0-9]{6}/[0-9]{2}$');
ALTER TABLE "ProtocoloDaNormaNoTce" ADD CONSTRAINT "ProtocoloDaNormaNoTce_fundamento_check" CHECK (length(trim("fundamento")) >= 10);
