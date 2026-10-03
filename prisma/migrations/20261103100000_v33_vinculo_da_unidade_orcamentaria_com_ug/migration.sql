-- V33 — de qual UG é cada unidade orçamentária (declarado, insert-only). Aditiva: uma tabela, dois índices, duas FKs.
-- O `migrate diff` também listava DROP/ADD de FKs já existentes (deriva antiga de ordem, sem mudança de definição);
-- ficaram de fora — esta migração não remove nada.

-- CreateTable
CREATE TABLE "VinculoDaUnidadeOrcamentariaComUg" (
    "id" TEXT NOT NULL,
    "unidadeOrcId" TEXT NOT NULL,
    "ugId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VinculoDaUnidadeOrcamentariaComUg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VinculoDaUnidadeOrcamentariaComUg_ugId_idx" ON "VinculoDaUnidadeOrcamentariaComUg"("ugId");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoDaUnidadeOrcamentariaComUg_unidadeOrcId_vigenteDesde_key" ON "VinculoDaUnidadeOrcamentariaComUg"("unidadeOrcId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "VinculoDaUnidadeOrcamentariaComUg" ADD CONSTRAINT "VinculoDaUnidadeOrcamentariaComUg_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoDaUnidadeOrcamentariaComUg" ADD CONSTRAINT "VinculoDaUnidadeOrcamentariaComUg_ugId_fkey" FOREIGN KEY ("ugId") REFERENCES "UnidadeGestora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
