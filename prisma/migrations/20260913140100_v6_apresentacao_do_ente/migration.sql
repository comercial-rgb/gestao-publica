-- V6 P0.1 — a apresentação do ente, versionada (append-only). DDL gerada por `prisma migrate diff`
-- sobre o schema local; os CHECKs fecham o conjunto do tema, o MIME e o tamanho da imagem.

-- CreateTable
CREATE TABLE "VersaoDaApresentacaoDoEnte" (
    "id" TEXT NOT NULL,
    "enteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nomeDeExibicao" TEXT NOT NULL,
    "orgao" TEXT,
    "assinaturaDoFornecedor" TEXT,
    "contatoEmail" TEXT,
    "contatoTelefone" TEXT,
    "horarioDeAtendimento" TEXT,
    "sitio" TEXT,
    "tema" VARCHAR(20) NOT NULL,
    "imagemMime" VARCHAR(10),
    "imagem" BYTEA,
    "canalTransparencia" BOOLEAN NOT NULL,
    "canalConsultaPublica" BOOLEAN NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoDaApresentacaoDoEnte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersaoDaApresentacaoDoEnte_enteId_numero_key" ON "VersaoDaApresentacaoDoEnte"("enteId", "numero");

-- AddForeignKey
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "VersaoDaApresentacaoDoEnte_enteId_fkey" FOREIGN KEY ("enteId") REFERENCES "EnteConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- O tema é um conjunto FECHADO: configuração de apresentação, nunca CSS ou script.
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "ck_apresentacao_tema"
  CHECK ("tema" IN ('PADRAO', 'ALTO_CONTRASTE'));
-- A imagem só entra como PNG ou JPEG, e mime e bytes andam juntos (ou ambos, ou nenhum).
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "ck_apresentacao_imagem_mime"
  CHECK ("imagemMime" IS NULL OR "imagemMime" IN ('image/png', 'image/jpeg'));
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "ck_apresentacao_imagem_par"
  CHECK (("imagemMime" IS NULL) = ("imagem" IS NULL));
-- 256 KiB: uma marca institucional, não um acervo. O domínio recusa antes; o banco recusa sempre.
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "ck_apresentacao_imagem_tamanho"
  CHECK ("imagem" IS NULL OR octet_length("imagem") <= 262144);
-- O sequencial começa em 1.
ALTER TABLE "VersaoDaApresentacaoDoEnte" ADD CONSTRAINT "ck_apresentacao_numero"
  CHECK ("numero" >= 1);
