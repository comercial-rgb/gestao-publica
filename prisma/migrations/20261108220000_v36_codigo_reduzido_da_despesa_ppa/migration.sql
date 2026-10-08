-- V36 (TR 5.9.1.8) — o código reduzido da despesa do PPA. Aditiva.
-- CreateTable
CREATE TABLE "CodigoReduzidoDaDespesaPpa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "subfuncaoId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CodigoReduzidoDaDespesaPpa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoReduzidoDaDespesaPpa_planoId_numero_key" ON "CodigoReduzidoDaDespesaPpa"("planoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoReduzidoDaDespesaPpa_combinacao_key" ON "CodigoReduzidoDaDespesaPpa"("planoId", "unidadeOrcId", "funcaoId", "subfuncaoId", "programaId", "acaoId");

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoPlurianual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "Funcao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_subfuncaoId_fkey" FOREIGN KEY ("subfuncaoId") REFERENCES "Subfuncao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK que o Prisma não representa.
ALTER TABLE "CodigoReduzidoDaDespesaPpa" ADD CONSTRAINT "CodigoReduzidoDaDespesaPpa_numero_positivo" CHECK ("numero" >= 1);
