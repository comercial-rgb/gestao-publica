-- V23 — o plano de contas do TCE-PB com as exigências por conta (SAGRES §5.28, §4.19, §4.20) e o
-- documento do contribuinte no ingresso extraorçamentário avulso (§4.19 cpfCnpjFornecedor).
-- Aditiva: duas tabelas novas e uma coluna nula.

CREATE TABLE "ImportacaoDoPlanoDoTribunal" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "anoDaTabela" INTEGER NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "arquivoSha256" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ImportacaoDoPlanoDoTribunal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContaDoPlanoDoTribunal" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "exigeRetencao" BOOLEAN NOT NULL,
    "exigeReceitaExtra" BOOLEAN NOT NULL,
    CONSTRAINT "ContaDoPlanoDoTribunal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportacaoDoPlanoDoTribunal_exercicio_criadoEm_idx" ON "ImportacaoDoPlanoDoTribunal"("exercicio", "criadoEm");
CREATE UNIQUE INDEX "ContaDoPlanoDoTribunal_importacaoId_codigo_key" ON "ContaDoPlanoDoTribunal"("importacaoId", "codigo");
ALTER TABLE "ContaDoPlanoDoTribunal" ADD CONSTRAINT "ContaDoPlanoDoTribunal_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoDoPlanoDoTribunal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentoExtraorcamentario" ADD COLUMN "documentoDoContribuinte" TEXT;
