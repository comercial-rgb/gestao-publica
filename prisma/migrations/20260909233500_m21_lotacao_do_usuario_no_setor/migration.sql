-- CreateTable
CREATE TABLE "UsuarioDoSetor" (
    "id" TEXT NOT NULL,
    "usuarioIdent" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "UsuarioDoSetor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsuarioDoSetor_setorId_idx" ON "UsuarioDoSetor"("setorId");

-- CreateIndex
CREATE INDEX "UsuarioDoSetor_usuarioIdent_idx" ON "UsuarioDoSetor"("usuarioIdent");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioDoSetor_usuarioIdent_setorId_key" ON "UsuarioDoSetor"("usuarioIdent", "setorId");

-- AddForeignKey
ALTER TABLE "UsuarioDoSetor" ADD CONSTRAINT "UsuarioDoSetor_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

