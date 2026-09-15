-- V7 M2 U0.1 — o ADMINISTRADOR DA FISCALIZAÇÃO como definição (pessoa, usuário, ato, vigência), e a revogação
-- como fato. Aditiva: nenhuma tabela existente muda.
CREATE TABLE "AdministradorDaFiscalizacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "atoDesignacao" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "AdministradorDaFiscalizacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_administrador_da_fiscalizacao_vigencia" CHECK ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio")
);
CREATE TABLE "RevogacaoDeAdministradorDaFiscalizacao" (
    "id" TEXT NOT NULL,
    "administradorId" TEXT NOT NULL,
    "dataEfeito" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RevogacaoDeAdministradorDaFiscalizacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdministradorDaFiscalizacao_usuarioId_idx" ON "AdministradorDaFiscalizacao"("usuarioId");
CREATE INDEX "AdministradorDaFiscalizacao_pessoaId_idx" ON "AdministradorDaFiscalizacao"("pessoaId");
CREATE UNIQUE INDEX "RevogacaoDeAdministradorDaFiscalizacao_administradorId_key" ON "RevogacaoDeAdministradorDaFiscalizacao"("administradorId");
ALTER TABLE "AdministradorDaFiscalizacao" ADD CONSTRAINT "AdministradorDaFiscalizacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdministradorDaFiscalizacao" ADD CONSTRAINT "AdministradorDaFiscalizacao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevogacaoDeAdministradorDaFiscalizacao" ADD CONSTRAINT "RevogacaoDeAdministradorDaFiscalizacao_administradorId_fkey" FOREIGN KEY ("administradorId") REFERENCES "AdministradorDaFiscalizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
