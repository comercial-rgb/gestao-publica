-- V39-R3 (R3-016, M07) — o realizavel de natureza ativa: categoria, conta decidida pelo ente e movimentos (constituicao,
-- baixa, anulacao). Aditiva: tres tabelas append-only e os CHECKs de prisma/sql/ck_realizavel.sql.

-- CreateEnum
CREATE TYPE "TipoMovimentoDeRealizavel" AS ENUM ('CONSTITUICAO', 'BAIXA');

-- CreateTable
CREATE TABLE "CategoriaDeRealizavel" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CategoriaDeRealizavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisaoDaCategoriaDeRealizavel" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "contaAtivoId" TEXT,
    "ativa" BOOLEAN NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DecisaoDaCategoriaDeRealizavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoDeRealizavel" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "decisaoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoDeRealizavel" NOT NULL,
    "devedor" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "historico" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "estornoDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "MovimentoDeRealizavel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaDeRealizavel_codigo_key" ON "CategoriaDeRealizavel"("codigo");

-- CreateIndex
CREATE INDEX "DecisaoDaCategoriaDeRealizavel_categoriaId_criadoEm_idx" ON "DecisaoDaCategoriaDeRealizavel"("categoriaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDeRealizavel_lancamentoId_key" ON "MovimentoDeRealizavel"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoDeRealizavel_estornoDeId_key" ON "MovimentoDeRealizavel"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoDeRealizavel_categoriaId_devedor_idx" ON "MovimentoDeRealizavel"("categoriaId", "devedor");

-- AddForeignKey
ALTER TABLE "DecisaoDaCategoriaDeRealizavel" ADD CONSTRAINT "DecisaoDaCategoriaDeRealizavel_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDeRealizavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisaoDaCategoriaDeRealizavel" ADD CONSTRAINT "DecisaoDaCategoriaDeRealizavel_contaAtivoId_fkey" FOREIGN KEY ("contaAtivoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDeRealizavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_decisaoId_fkey" FOREIGN KEY ("decisaoId") REFERENCES "DecisaoDaCategoriaDeRealizavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "MovimentoDeRealizavel_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoDeRealizavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movimento_de_realizavel') THEN
    ALTER TABLE "MovimentoDeRealizavel" ADD CONSTRAINT "ck_movimento_de_realizavel"
      CHECK ("valor" > 0 AND "devedor" ~ '^[0-9]{11}$|^[0-9]{14}$' AND length(btrim("documento")) > 0 AND length(btrim("historico")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_decisao_do_realizavel') THEN
    ALTER TABLE "DecisaoDaCategoriaDeRealizavel" ADD CONSTRAINT "ck_decisao_do_realizavel"
      CHECK (length(btrim("fundamento")) > 0 AND (NOT "ativa" OR "contaAtivoId" IS NOT NULL));
  END IF;
END $$;
