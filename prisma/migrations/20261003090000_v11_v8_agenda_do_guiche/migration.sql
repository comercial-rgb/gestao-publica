-- V11 V8 — A AGENDA DO GUICHÊ (TR 5.39.92)
--
-- Aditiva: dez tabelas novas, nenhum DROP, nenhuma coluna alterada em tabela existente.
-- As tabelas são APPEND-ONLY; nenhuma entra no censo de UPDATE/DELETE do papel de runtime.

-- ── O LOCAL E O POSTO ────────────────────────────────────────────────────────
CREATE TABLE "UnidadeDeAtendimento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "UnidadeDeAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnidadeDeAtendimento_codigo_key" ON "UnidadeDeAtendimento"("codigo");
CREATE INDEX "UnidadeDeAtendimento_setorId_idx" ON "UnidadeDeAtendimento"("setorId");
ALTER TABLE "UnidadeDeAtendimento" ADD CONSTRAINT "UnidadeDeAtendimento_setorId_fkey"
    FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GuicheDeAtendimento" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "GuicheDeAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuicheDeAtendimento_unidadeId_nome_key" ON "GuicheDeAtendimento"("unidadeId", "nome");
CREATE INDEX "GuicheDeAtendimento_unidadeId_idx" ON "GuicheDeAtendimento"("unidadeId");
ALTER TABLE "GuicheDeAtendimento" ADD CONSTRAINT "GuicheDeAtendimento_unidadeId_fkey"
    FOREIGN KEY ("unidadeId") REFERENCES "UnidadeDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── QUE SERVIÇO O GUICHÊ ATENDE — fato, com vigente = último ─────────────────
CREATE TABLE "SituacaoDoServicoNoGuiche" (
    "id" TEXT NOT NULL,
    "guicheId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "SituacaoDoServicoNoGuiche_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SituacaoDoServicoNoGuiche_guicheId_servicoId_criadoEm_idx"
    ON "SituacaoDoServicoNoGuiche"("guicheId", "servicoId", "criadoEm");
CREATE INDEX "SituacaoDoServicoNoGuiche_servicoId_idx" ON "SituacaoDoServicoNoGuiche"("servicoId");
ALTER TABLE "SituacaoDoServicoNoGuiche" ADD CONSTRAINT "SituacaoDoServicoNoGuiche_guicheId_fkey"
    FOREIGN KEY ("guicheId") REFERENCES "GuicheDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SituacaoDoServicoNoGuiche" ADD CONSTRAINT "SituacaoDoServicoNoGuiche_servicoId_fkey"
    FOREIGN KEY ("servicoId") REFERENCES "ServicoDaCarta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── A OFERTA ─────────────────────────────────────────────────────────────────
CREATE TABLE "JanelaDeAtendimento" (
    "id" TEXT NOT NULL,
    "guicheId" TEXT NOT NULL,
    "diaDaSemana" INTEGER NOT NULL,
    "horaInicio" VARCHAR(5) NOT NULL,
    "horaFim" VARCHAR(5) NOT NULL,
    "duracaoMinutos" INTEGER NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "JanelaDeAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JanelaDeAtendimento_guicheId_diaDaSemana_idx" ON "JanelaDeAtendimento"("guicheId", "diaDaSemana");
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "JanelaDeAtendimento_guicheId_fkey"
    FOREIGN KEY ("guicheId") REFERENCES "GuicheDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ O BANCO RECUSA O IMPOSSÍVEL. Uma janela de capacidade zero não é "fechada", é uma oferta
-- que aceita reserva nenhuma e não diz por quê; duração zero faria a geração de horários girar
-- para sempre; hora de fim antes da de início é oferta vazia que ninguém enxerga.
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_dia_da_semana"
    CHECK ("diaDaSemana" BETWEEN 0 AND 6);
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_duracao_positiva"
    CHECK ("duracaoMinutos" > 0);
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_capacidade_positiva"
    CHECK ("capacidade" >= 1);
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_horas_no_formato"
    CHECK ("horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "horaFim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_inicio_antes_do_fim"
    CHECK ("horaInicio" < "horaFim");
ALTER TABLE "JanelaDeAtendimento" ADD CONSTRAINT "ck_janela_vigencia_coerente"
    CHECK ("vigenciaFim" IS NULL OR "vigenciaFim" >= "vigenciaInicio");

-- ── O DIA EM QUE NÃO ABRE ────────────────────────────────────────────────────
CREATE TABLE "ExcecaoDeCalendarioDoAtendimento" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ExcecaoDeCalendarioDoAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExcecaoDeCalendarioDoAtendimento_unidadeId_dia_key"
    ON "ExcecaoDeCalendarioDoAtendimento"("unidadeId", "dia");
CREATE INDEX "ExcecaoDeCalendarioDoAtendimento_dia_idx" ON "ExcecaoDeCalendarioDoAtendimento"("dia");
ALTER TABLE "ExcecaoDeCalendarioDoAtendimento" ADD CONSTRAINT "ExcecaoDeCalendarioDoAtendimento_unidadeId_fkey"
    FOREIGN KEY ("unidadeId") REFERENCES "UnidadeDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── A RESERVA E OS FATOS QUE MUDAM A VIDA DELA ───────────────────────────────
CREATE TABLE "ReservaDeAtendimento" (
    "id" TEXT NOT NULL,
    "guicheId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "horaInicio" VARCHAR(5) NOT NULL,
    "codigo" TEXT NOT NULL,
    "chaveDeIdempotencia" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ReservaDeAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservaDeAtendimento_codigo_key" ON "ReservaDeAtendimento"("codigo");
CREATE UNIQUE INDEX "ReservaDeAtendimento_chaveDeIdempotencia_key" ON "ReservaDeAtendimento"("chaveDeIdempotencia");
CREATE INDEX "ReservaDeAtendimento_guicheId_dia_idx" ON "ReservaDeAtendimento"("guicheId", "dia");
CREATE INDEX "ReservaDeAtendimento_pessoaId_idx" ON "ReservaDeAtendimento"("pessoaId");
CREATE INDEX "ReservaDeAtendimento_servicoId_idx" ON "ReservaDeAtendimento"("servicoId");
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ReservaDeAtendimento_guicheId_fkey"
    FOREIGN KEY ("guicheId") REFERENCES "GuicheDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ReservaDeAtendimento_servicoId_fkey"
    FOREIGN KEY ("servicoId") REFERENCES "ServicoDaCarta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ReservaDeAtendimento_pessoaId_fkey"
    FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ck_reserva_hora_no_formato"
    CHECK ("horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

CREATE TABLE "ConfirmacaoDaReserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ConfirmacaoDaReserva_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConfirmacaoDaReserva_reservaId_key" ON "ConfirmacaoDaReserva"("reservaId");
ALTER TABLE "ConfirmacaoDaReserva" ADD CONSTRAINT "ConfirmacaoDaReserva_reservaId_fkey"
    FOREIGN KEY ("reservaId") REFERENCES "ReservaDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CancelamentoDaReserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "CancelamentoDaReserva_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CancelamentoDaReserva_reservaId_key" ON "CancelamentoDaReserva"("reservaId");
ALTER TABLE "CancelamentoDaReserva" ADD CONSTRAINT "CancelamentoDaReserva_reservaId_fkey"
    FOREIGN KEY ("reservaId") REFERENCES "ReservaDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReagendamentoDaReserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "guicheId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "horaInicio" VARCHAR(5) NOT NULL,
    "motivo" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "ReagendamentoDaReserva_pkey" PRIMARY KEY ("id")
);
-- ⚠️ O "ÚLTIMO" REAGENDAMENTO É O DE MAIOR SEQUÊNCIA, NÃO O DE MAIOR `criadoEm`: dentro de uma
-- transação o Postgres devolve o instante de INÍCIO dela, e duas transações podem começar no
-- mesmo milissegundo. A unicidade faz o banco recusar dois "segundos" em vez de escolher um.
CREATE UNIQUE INDEX "ReagendamentoDaReserva_reservaId_sequencia_key" ON "ReagendamentoDaReserva"("reservaId", "sequencia");
CREATE INDEX "ReagendamentoDaReserva_reservaId_sequencia_idx" ON "ReagendamentoDaReserva"("reservaId", "sequencia");
ALTER TABLE "ReagendamentoDaReserva" ADD CONSTRAINT "ck_reagendamento_sequencia_positiva" CHECK ("sequencia" >= 1);
CREATE INDEX "ReagendamentoDaReserva_guicheId_dia_idx" ON "ReagendamentoDaReserva"("guicheId", "dia");
ALTER TABLE "ReagendamentoDaReserva" ADD CONSTRAINT "ReagendamentoDaReserva_reservaId_fkey"
    FOREIGN KEY ("reservaId") REFERENCES "ReservaDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReagendamentoDaReserva" ADD CONSTRAINT "ReagendamentoDaReserva_guicheId_fkey"
    FOREIGN KEY ("guicheId") REFERENCES "GuicheDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReagendamentoDaReserva" ADD CONSTRAINT "ck_reagendamento_hora_no_formato"
    CHECK ("horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

CREATE TABLE "RealizacaoDoAtendimento" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "atendidoPor" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "RealizacaoDoAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealizacaoDoAtendimento_reservaId_key" ON "RealizacaoDoAtendimento"("reservaId");
ALTER TABLE "RealizacaoDoAtendimento" ADD CONSTRAINT "RealizacaoDoAtendimento_reservaId_fkey"
    FOREIGN KEY ("reservaId") REFERENCES "ReservaDeAtendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
