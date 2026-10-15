-- V39-R3 (R3-027): a rejeição de um item do borderô pelo retorno do banco. Aditiva.
-- CreateTable
CREATE TABLE "RejeicaoDeRetornoBancario" (
    "id" TEXT NOT NULL,
    "borderoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ocorrencia" VARCHAR(200) NOT NULL,
    "dataRejeicao" TIMESTAMP(3) NOT NULL,
    "movimentoDaOrdemId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RejeicaoDeRetornoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RejeicaoDeRetornoBancario_itemId_key" ON "RejeicaoDeRetornoBancario"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RejeicaoDeRetornoBancario_movimentoDaOrdemId_key" ON "RejeicaoDeRetornoBancario"("movimentoDaOrdemId");

-- CreateIndex
CREATE INDEX "RejeicaoDeRetornoBancario_borderoId_idx" ON "RejeicaoDeRetornoBancario"("borderoId");

-- AddForeignKey
ALTER TABLE "RejeicaoDeRetornoBancario" ADD CONSTRAINT "RejeicaoDeRetornoBancario_borderoId_fkey" FOREIGN KEY ("borderoId") REFERENCES "Bordero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejeicaoDeRetornoBancario" ADD CONSTRAINT "RejeicaoDeRetornoBancario_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejeicaoDeRetornoBancario" ADD CONSTRAINT "RejeicaoDeRetornoBancario_movimentoDaOrdemId_fkey" FOREIGN KEY ("movimentoDaOrdemId") REFERENCES "MovimentoDaOrdemDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

