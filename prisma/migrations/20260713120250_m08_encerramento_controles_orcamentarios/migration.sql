-- CreateEnum
CREATE TYPE "DestinoNaVirada" AS ENUM ('ENCERRA', 'TRANSFERE');

-- CreateTable
CREATE TABLE "ContaNaVirada" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "destino" "DestinoNaVirada" NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContaNaVirada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaNaVirada_contaId_key" ON "ContaNaVirada"("contaId");

-- AddForeignKey
ALTER TABLE "ContaNaVirada" ADD CONSTRAINT "ContaNaVirada_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
