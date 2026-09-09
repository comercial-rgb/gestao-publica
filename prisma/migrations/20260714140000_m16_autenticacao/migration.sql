-- M16 — AUTENTICAÇÃO (TR 4.55) e REGISTRO DE OPERAÇÃO (TR 6.1-6.3).
--
-- ADITIVA: só cria tabelas. Nenhuma coluna existente é tocada, nenhum dado é perdido —
-- o domínio (os 76 serviços) segue recebendo `criadoPor: string`, sem uma linha mudada.
--
-- ⚠️ O QUE **NÃO** ESTÁ AQUI: nenhuma senha, e nenhum token. A `CredencialDeUsuario` guarda
-- um hash scrypt AUTODESCRITIVO (`scrypt$N$r$p$salt$hash`) e a `SessaoAberta` guarda o
-- SHA-256 do token. Um dump deste banco não entrega credencial nenhuma — é o ponto.
--
-- ⚠️ E NÃO HÁ FLAG NENHUMA. Nem `sessao.valida`, nem `usuario.tentativasFalhas`: a validade
-- da sessão e o cadeado do login são DERIVADOS dos fatos (a revogação é uma linha; a
-- tentativa é uma linha). É a mesma disciplina do resto do repositório — o status do
-- empenho sai dos SUMs, o travamento sai dos eventos, e nada guarda um estado que possa
-- divergir da própria história.

-- CreateEnum
CREATE TYPE "ResultadoOperacao" AS ENUM ('SUCESSO', 'NEGADO', 'ERRO');

-- CreateTable
CREATE TABLE "CredencialDeUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "hashString" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredencialDeUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoAberta" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "agente" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoAberta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoRevogada" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoRevogada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaDeLogin" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaDeLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroDeOperacao" (
    "id" TEXT NOT NULL,
    "usuarioIdent" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "ip" TEXT,
    "agente" TEXT,
    "resultado" "ResultadoOperacao" NOT NULL,
    "detalhe" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroDeOperacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredencialDeUsuario_usuarioId_criadoEm_idx" ON "CredencialDeUsuario"("usuarioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoAberta_tokenHash_key" ON "SessaoAberta"("tokenHash");

-- CreateIndex
CREATE INDEX "SessaoAberta_usuarioId_idx" ON "SessaoAberta"("usuarioId");

-- CreateIndex
CREATE INDEX "SessaoAberta_expiraEm_idx" ON "SessaoAberta"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoRevogada_sessaoId_key" ON "SessaoRevogada"("sessaoId");

-- CreateIndex
CREATE INDEX "TentativaDeLogin_identificador_criadoEm_idx" ON "TentativaDeLogin"("identificador", "criadoEm");

-- CreateIndex
CREATE INDEX "RegistroDeOperacao_usuarioIdent_criadoEm_idx" ON "RegistroDeOperacao"("usuarioIdent", "criadoEm");

-- CreateIndex
CREATE INDEX "RegistroDeOperacao_criadoEm_idx" ON "RegistroDeOperacao"("criadoEm");

-- CreateIndex
CREATE INDEX "RegistroDeOperacao_resultado_idx" ON "RegistroDeOperacao"("resultado");

-- AddForeignKey
ALTER TABLE "CredencialDeUsuario" ADD CONSTRAINT "CredencialDeUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoAberta" ADD CONSTRAINT "SessaoAberta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoRevogada" ADD CONSTRAINT "SessaoRevogada_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoAberta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

