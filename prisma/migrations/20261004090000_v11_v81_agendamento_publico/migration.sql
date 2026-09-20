-- V11 V8.1 — O AGENDAMENTO PELO CIDADÃO (TR 5.39.92, seção 5.39 = portal de AUTOATENDIMENTO)
--
-- Aditiva. O único comando que não acrescenta é o `DROP NOT NULL` de `pessoaId`, e ele ALARGA o
-- domínio da coluna em vez de destruir dado: nenhuma linha existente muda, e o CHECK abaixo
-- garante que continua havendo exatamente um titular por reserva.

-- ── QUE SERVIÇO O CIDADÃO PODE MARCAR SOZINHO ────────────────────────────────
-- ⚠️ `false` POR PADRÃO, e o padrão é a decisão: nada vira agendável pelo portal por acidente
-- quando esta migration roda num banco que já tem guichês configurados.
ALTER TABLE "SituacaoDoServicoNoGuiche"
    ADD COLUMN "agendamentoPublico" BOOLEAN NOT NULL DEFAULT false;

-- ── AS DUAS FORMAS DE TITULAR ────────────────────────────────────────────────
ALTER TABLE "ReservaDeAtendimento" ALTER COLUMN "pessoaId" DROP NOT NULL;
ALTER TABLE "ReservaDeAtendimento" ADD COLUMN "nomeDeclarado" TEXT;
ALTER TABLE "ReservaDeAtendimento" ADD COLUMN "documentoDeclarado" VARCHAR(14);
ALTER TABLE "ReservaDeAtendimento" ADD COLUMN "segredoHash" TEXT;

CREATE UNIQUE INDEX "ReservaDeAtendimento_segredoHash_key" ON "ReservaDeAtendimento"("segredoHash");

-- ⚠️ EXATAMENTE UM TITULAR, CONFERIDO PELO BANCO. Uma reserva com os dois lados preenchidos diria
-- duas coisas diferentes sobre quem vai ser atendido; uma com nenhum não diria nada, e apareceria
-- na agenda como uma linha sem dono. O domínio já recusa as duas, e o CHECK é o que sobra quando
-- alguém escrever por fora dele.
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ck_reserva_titular_xor" CHECK (
    ("pessoaId" IS NOT NULL AND "nomeDeclarado" IS NULL AND "documentoDeclarado" IS NULL)
    OR
    ("pessoaId" IS NULL AND "nomeDeclarado" IS NOT NULL AND "documentoDeclarado" IS NOT NULL)
);

-- ⚠️ SEGREDO SÓ EXISTE EM RESERVA DO PORTAL. Uma marcação feita no balcão não tem segredo para
-- entregar a ninguém — a pessoa foi identificada ali, com o documento na mão. Guardar um segredo
-- que nunca foi dito criaria a ilusão de um canal de cancelamento que não existe.
ALTER TABLE "ReservaDeAtendimento" ADD CONSTRAINT "ck_reserva_segredo_so_do_portal" CHECK (
    "segredoHash" IS NULL OR "pessoaId" IS NULL
);
