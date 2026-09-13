-- Sessão noturna V4 (§4) — competência por bem elegível, vigência do parâmetro e ordem estável.
-- ADITIVA: colunas anuláveis, uma sequência, uma tabela nova. Zero DROP, zero alteração de coluna.

-- A ordem de registro, estável (desempate da análise de dependências).
ALTER TABLE "MovimentoPatrimonial" ADD COLUMN "sequencia" SERIAL NOT NULL;
CREATE UNIQUE INDEX "MovimentoPatrimonial_sequencia_key" ON "MovimentoPatrimonial"("sequencia");

-- A vigência de negócio da versão do parâmetro.
ALTER TABLE "VersaoDeParametroDeAtualizacao" ADD COLUMN "vigenteDesde" TIMESTAMP(3);

-- A identidade da execução mensal.
CREATE TABLE "ExecucaoDeAtualizacao" (
    "id" TEXT NOT NULL,
    "classeDeBensId" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "corte" TIMESTAMP(3) NOT NULL,
    "escopo" TEXT NOT NULL,
    "bemId" TEXT,
    "versaoDeParametroId" TEXT,
    "metodo" "MetodoAtualizacao" NOT NULL,
    "quantidadeDeItens" INTEGER NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "valorDaParcela" DECIMAL(18,2) NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ExecucaoDeAtualizacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExecucaoDeAtualizacao_classeDeBensId_competencia_idx" ON "ExecucaoDeAtualizacao"("classeDeBensId", "competencia");
CREATE INDEX "ExecucaoDeAtualizacao_lancamentoId_idx" ON "ExecucaoDeAtualizacao"("lancamentoId");
ALTER TABLE "ExecucaoDeAtualizacao" ADD CONSTRAINT "ExecucaoDeAtualizacao_classeDeBensId_fkey" FOREIGN KEY ("classeDeBensId") REFERENCES "ClasseDeBens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecucaoDeAtualizacao" ADD CONSTRAINT "ExecucaoDeAtualizacao_versaoDeParametroId_fkey" FOREIGN KEY ("versaoDeParametroId") REFERENCES "VersaoDeParametroDeAtualizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A memória por item: a execução e o corte.
ALTER TABLE "MemoriaDeAtualizacao" ADD COLUMN "execucaoId" TEXT, ADD COLUMN "corte" TIMESTAMP(3);
ALTER TABLE "MemoriaDeAtualizacao" ADD CONSTRAINT "MemoriaDeAtualizacao_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoDeAtualizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
