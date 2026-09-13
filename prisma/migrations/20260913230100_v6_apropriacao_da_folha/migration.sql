-- V6 P2.3b — a apropriação contábil da folha: grupos de empenho, o ato e o elo empenho x folha.
-- DDL gerada por `prisma migrate diff`; os CHECKs abaixo são deste repositório.

-- CreateTable
CREATE TABLE "GrupoDeEmpenhoDaFolha" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "categoriaOrdemCronologica" "CategoriaOrdemCronologica" NOT NULL,
    "tipoEmpenho" "TipoEmpenho" NOT NULL,
    "serie" VARCHAR(10) NOT NULL,
    "porServidor" BOOLEAN NOT NULL,
    "credorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "GrupoDeEmpenhoDaFolha_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "RubricaDoGrupoDeEmpenho" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RubricaDoGrupoDeEmpenho_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ApropriacaoDaFolha" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "dataDoEmpenho" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ApropriacaoDaFolha_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EmpenhoDaFolha" (
    "id" TEXT NOT NULL,
    "apropriacaoId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "vinculoId" TEXT,
    "empenhoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "EmpenhoDaFolha_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "GrupoDeEmpenhoDaFolha_codigo_key" ON "GrupoDeEmpenhoDaFolha"("codigo");
-- CreateIndex
CREATE INDEX "GrupoDeEmpenhoDaFolha_fichaId_idx" ON "GrupoDeEmpenhoDaFolha"("fichaId");
-- CreateIndex
CREATE UNIQUE INDEX "RubricaDoGrupoDeEmpenho_rubricaId_key" ON "RubricaDoGrupoDeEmpenho"("rubricaId");
-- CreateIndex
CREATE INDEX "RubricaDoGrupoDeEmpenho_grupoId_idx" ON "RubricaDoGrupoDeEmpenho"("grupoId");
-- CreateIndex
CREATE UNIQUE INDEX "ApropriacaoDaFolha_folhaId_key" ON "ApropriacaoDaFolha"("folhaId");
-- CreateIndex
CREATE UNIQUE INDEX "EmpenhoDaFolha_empenhoId_key" ON "EmpenhoDaFolha"("empenhoId");
-- CreateIndex
CREATE INDEX "EmpenhoDaFolha_apropriacaoId_idx" ON "EmpenhoDaFolha"("apropriacaoId");
-- CreateIndex
CREATE INDEX "EmpenhoDaFolha_grupoId_idx" ON "EmpenhoDaFolha"("grupoId");
-- CreateIndex
CREATE INDEX "EmpenhoDaFolha_vinculoId_idx" ON "EmpenhoDaFolha"("vinculoId");
-- AddForeignKey
ALTER TABLE "GrupoDeEmpenhoDaFolha" ADD CONSTRAINT "GrupoDeEmpenhoDaFolha_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GrupoDeEmpenhoDaFolha" ADD CONSTRAINT "GrupoDeEmpenhoDaFolha_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RubricaDoGrupoDeEmpenho" ADD CONSTRAINT "RubricaDoGrupoDeEmpenho_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RubricaDoGrupoDeEmpenho" ADD CONSTRAINT "RubricaDoGrupoDeEmpenho_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ApropriacaoDaFolha" ADD CONSTRAINT "ApropriacaoDaFolha_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaDePagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EmpenhoDaFolha" ADD CONSTRAINT "EmpenhoDaFolha_apropriacaoId_fkey" FOREIGN KEY ("apropriacaoId") REFERENCES "ApropriacaoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EmpenhoDaFolha" ADD CONSTRAINT "EmpenhoDaFolha_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoDeEmpenhoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EmpenhoDaFolha" ADD CONSTRAINT "EmpenhoDaFolha_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EmpenhoDaFolha" ADD CONSTRAINT "EmpenhoDaFolha_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "Empenho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ CHECKs ═══
-- O credor é EXIGIDO no empenho único do grupo e PROIBIDO no empenho por servidor (lá o credor é
-- o CPF de cada um). Um grupo com os dois preenchidos esconderia qual deles o empenho usou.
ALTER TABLE "GrupoDeEmpenhoDaFolha"
  ADD CONSTRAINT "ck_grupo_folha_credor"
  CHECK (("porServidor" = false AND "credorId" IS NOT NULL) OR ("porServidor" = true AND "credorId" IS NULL));
-- A série entra no número do empenho: sem ela não há numeração determinística, e é a numeração
-- determinística que impede a apropriação repetida de duplicar a despesa.
ALTER TABLE "GrupoDeEmpenhoDaFolha"
  ADD CONSTRAINT "ck_grupo_folha_serie"
  CHECK (btrim("serie") <> '' AND "serie" ~ '^[A-Z0-9-]{1,10}$');
ALTER TABLE "EmpenhoDaFolha" ADD CONSTRAINT "ck_empenho_da_folha_valor" CHECK ("valor" > 0);
