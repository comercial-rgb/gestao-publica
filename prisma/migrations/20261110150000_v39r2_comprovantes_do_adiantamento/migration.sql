-- V39-R2 (M05) — os comprovantes da aplicação do adiantamento (diária e suprimento), um por despesa. Aditiva: uma tabela
-- nova, append-only, e o CHECK de prisma/sql/ck_comprovante_do_adiantamento.sql.
-- CreateTable
CREATE TABLE "ComprovanteDaPrestacaoDoAdiantamento" (
    "id" TEXT NOT NULL,
    "prestacaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "documento" VARCHAR(80) NOT NULL,
    "emitente" VARCHAR(120) NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ComprovanteDaPrestacaoDoAdiantamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComprovanteDaPrestacaoDoAdiantamento_prestacaoId_idx" ON "ComprovanteDaPrestacaoDoAdiantamento"("prestacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprovanteDaPrestacaoDoAdiantamento_prestacaoId_documento__key" ON "ComprovanteDaPrestacaoDoAdiantamento"("prestacaoId", "documento", "emitente");

-- AddForeignKey
ALTER TABLE "ComprovanteDaPrestacaoDoAdiantamento" ADD CONSTRAINT "ComprovanteDaPrestacaoDoAdiantamento_prestacaoId_fkey" FOREIGN KEY ("prestacaoId") REFERENCES "PrestacaoDeContasDoAdiantamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_comprovante_do_adiantamento') THEN
    ALTER TABLE "ComprovanteDaPrestacaoDoAdiantamento" ADD CONSTRAINT "ck_comprovante_do_adiantamento" CHECK ("valor" > 0);
  END IF;
END $$;
