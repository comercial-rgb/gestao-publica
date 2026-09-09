-- CreateEnum
CREATE TYPE "CanalDeNotificacao" AS ENUM ('SISTEMA', 'EMAIL', 'PUSH');

-- AlterTable
ALTER TABLE "MovimentoDoComunicado" ADD COLUMN     "hashConteudo" VARCHAR(64);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "canal" "CanalDeNotificacao" NOT NULL DEFAULT 'SISTEMA',
    "evento" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "rota" TEXT,
    "entregueEm" TIMESTAMP(3),
    "motivoIndisponivel" TEXT,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacao_destinatario_lidaEm_idx" ON "Notificacao"("destinatario", "lidaEm");

-- CreateIndex
CREATE INDEX "Notificacao_destinatario_criadoEm_idx" ON "Notificacao"("destinatario", "criadoEm");

-- CreateIndex
CREATE INDEX "Notificacao_canal_entregueEm_idx" ON "Notificacao"("canal", "entregueEm");

