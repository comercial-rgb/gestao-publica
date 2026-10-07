-- CreateTable
CREATE TABLE "PreviaDeAlteracao" (
    "id" TEXT NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipoCredito" "TipoCredito" NOT NULL,
    "origemRecurso" "OrigemRecurso" NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviaDeAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaPrevia" (
    "id" TEXT NOT NULL,
    "previaId" TEXT NOT NULL,
    "lote" INTEGER NOT NULL,
    "fichaId" TEXT NOT NULL,
    "tipo" "TipoItemCredito" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "reservaId" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDaPrevia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoDaPrevia" (
    "id" TEXT NOT NULL,
    "previaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "parecer" TEXT,
    "quantidadeDeItens" INTEGER NOT NULL,
    "totalSuplementado" DECIMAL(18,2) NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AprovacaoDaPrevia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesfechoDaPrevia" (
    "id" TEXT NOT NULL,
    "previaId" TEXT NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "decretoId" TEXT,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesfechoDaPrevia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreviaDeAlteracao_exercicio_numero_key" ON "PreviaDeAlteracao"("exercicio", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaPrevia_reservaId_key" ON "ItemDaPrevia"("reservaId");

-- CreateIndex
CREATE INDEX "ItemDaPrevia_previaId_idx" ON "ItemDaPrevia"("previaId");

-- CreateIndex
CREATE INDEX "ItemDaPrevia_fichaId_idx" ON "ItemDaPrevia"("fichaId");

-- CreateIndex
CREATE UNIQUE INDEX "AprovacaoDaPrevia_previaId_key" ON "AprovacaoDaPrevia"("previaId");

-- CreateIndex
CREATE UNIQUE INDEX "DesfechoDaPrevia_previaId_key" ON "DesfechoDaPrevia"("previaId");

-- CreateIndex
CREATE UNIQUE INDEX "DesfechoDaPrevia_decretoId_key" ON "DesfechoDaPrevia"("decretoId");

-- AddForeignKey
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_previaId_fkey" FOREIGN KEY ("previaId") REFERENCES "PreviaDeAlteracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaOrcamentaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "ReservaDotacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoDaPrevia" ADD CONSTRAINT "AprovacaoDaPrevia_previaId_fkey" FOREIGN KEY ("previaId") REFERENCES "PreviaDeAlteracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesfechoDaPrevia" ADD CONSTRAINT "DesfechoDaPrevia_previaId_fkey" FOREIGN KEY ("previaId") REFERENCES "PreviaDeAlteracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesfechoDaPrevia" ADD CONSTRAINT "DesfechoDaPrevia_decretoId_fkey" FOREIGN KEY ("decretoId") REFERENCES "DecretoCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- V36 (TR 5.9.3.23/24) — o item tem valor positivo e lote a partir de 1; só a anulação tem bloqueio, e tem sempre.
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_valor_check" CHECK ("valor" > 0);
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_lote_check" CHECK ("lote" >= 1);
ALTER TABLE "ItemDaPrevia" ADD CONSTRAINT "ItemDaPrevia_bloqueio_check" CHECK (("tipo" = 'ANULACAO') = ("reservaId" IS NOT NULL));
ALTER TABLE "PreviaDeAlteracao" ADD CONSTRAINT "PreviaDeAlteracao_numero_check" CHECK ("numero" >= 1);
ALTER TABLE "PreviaDeAlteracao" ADD CONSTRAINT "PreviaDeAlteracao_descricao_check" CHECK (btrim("descricao") <> '');
ALTER TABLE "AprovacaoDaPrevia" ADD CONSTRAINT "AprovacaoDaPrevia_snapshot_check" CHECK ("quantidadeDeItens" >= 1 AND "totalSuplementado" > 0);
-- O desfecho: a efetivação aponta o decreto e não tem motivo; o descarte tem motivo e não tem decreto.
ALTER TABLE "DesfechoDaPrevia" ADD CONSTRAINT "DesfechoDaPrevia_tipo_check" CHECK (
  ("tipo" = 'EFETIVADA' AND "decretoId" IS NOT NULL AND "motivo" IS NULL)
  OR ("tipo" = 'DESCARTADA' AND "decretoId" IS NULL AND "motivo" IS NOT NULL AND btrim("motivo") <> '')
);
