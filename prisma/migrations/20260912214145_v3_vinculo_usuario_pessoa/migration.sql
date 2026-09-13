-- V3 (pacote 2) - o vinculo explicito, opcional e auditavel entre Usuario e Pessoa, append-only,
-- e a acao administrativa que o concede. ADITIVA. Zero DROP.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'VINCULAR_PESSOA_AO_USUARIO';

CREATE TYPE "TipoDeVinculoUsuarioPessoa" AS ENUM ('VINCULO', 'DESVINCULO');

CREATE TABLE "VinculoUsuarioPessoa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipo" "TipoDeVinculoUsuarioPessoa" NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "VinculoUsuarioPessoa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VinculoUsuarioPessoa_usuarioId_criadoEm_idx" ON "VinculoUsuarioPessoa"("usuarioId", "criadoEm");
CREATE INDEX "VinculoUsuarioPessoa_pessoaId_criadoEm_idx" ON "VinculoUsuarioPessoa"("pessoaId", "criadoEm");

ALTER TABLE "VinculoUsuarioPessoa" ADD CONSTRAINT "VinculoUsuarioPessoa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoUsuarioPessoa" ADD CONSTRAINT "VinculoUsuarioPessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
