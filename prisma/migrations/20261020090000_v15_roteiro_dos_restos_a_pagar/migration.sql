-- V15 — A CONFIGURAÇÃO CONTÁBIL DAS OPERAÇÕES DE RESTOS A PAGAR
--
-- Aditiva: um enum novo, uma tabela nova. Zero DROP, nenhuma coluna existente tocada.
--
-- ⚠️ POR QUE ELA É NECESSÁRIA: as cinco operações de escrita do M08 recebem as contas por
-- parâmetro e nenhuma tela as alcançava, porque não havia de onde tirar o parâmetro. São TRÊS
-- as que pedem contas (os dois estornos invertem as pernas do lançamento original pelo
-- `gerarEstorno` do M01, e por isso não há evento de estorno no enum).
--
-- ⚠️ O CHECK DAS COMBINAÇÕES **NÃO** ESTÁ AQUI, e a omissão é deliberada. Ele mora em
-- `prisma/sql/ck_roteiro_restos_pernas.sql`, como `ck_movimento_contratual_xor`, porque o
-- Prisma não representa CHECK condicional. Criá-lo TAMBÉM aqui reproduziria exatamente a
-- colisão que deixou o `npm run deriva` sem medir por semanas: objeto criado por migration E
-- por `prisma/sql/` sem `IF NOT EXISTS`. Um dono por objeto.

CREATE TYPE "EventoDeRestosAPagar" AS ENUM (
  'LIQUIDACAO_NAO_PROCESSADO',
  'PAGAMENTO',
  'CANCELAMENTO_PROCESSADO',
  'CANCELAMENTO_NAO_PROCESSADO'
);

CREATE TABLE "RoteiroRestosAPagar" (
    "id"     TEXT NOT NULL,
    "evento" "EventoDeRestosAPagar" NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "fundamento" TEXT,

    -- O par PATRIMONIAL. Nulo no PAGAMENTO: lá o débito é o passivo que o DADO aponta (a
    -- obrigação que a liquidação de origem criou e que segue aberta) e o crédito é a conta
    -- contábil da conta bancária escolhida no ato.
    "contaDebitoId"  TEXT,
    "contaCreditoId" TEXT,

    -- O par de CONTROLE da DDR. A DDR comprometida ATRAVESSA a virada — o encerramento só
    -- varre as classes 5 e 6 —, e é por isso que ela aparece nas operações de RP.
    "contaControleDebitoId"  TEXT,
    "contaControleCreditoId" TEXT,

    "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "RoteiroRestosAPagar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoteiroRestosAPagar_evento_versao_key"
    ON "RoteiroRestosAPagar"("evento", "versao");
CREATE INDEX "RoteiroRestosAPagar_evento_versao_idx"
    ON "RoteiroRestosAPagar"("evento", "versao");

-- A versão é a SEQUÊNCIA DAS DECISÕES do ente sobre aquele evento: nunca zero, nunca negativa.
ALTER TABLE "RoteiroRestosAPagar"
  ADD CONSTRAINT "ck_roteiro_restos_versao_positiva" CHECK ("versao" >= 1);

-- ⚠️ `ON DELETE SET NULL`, E QUEM COBROU FOI O `npm run deriva` NA SUA PRIMEIRA EXECUCAO depois
-- de consertado. As quatro colunas sao NULAVEIS, e para relacao opcional o Prisma espera
-- `SET NULL`; eu havia escrito `RESTRICT`, e o passo (1) (migrations x modelo) acusou as quatro.
--
-- ⚠️ E ELE ACUSOU MAIS: 52 instrucoes no total, das quais 36 sao ANTERIORES a esta unidade e do
-- MESMO padrao — `ReceitaArrecadada`, `DecisaoDoTipoDeConsignacao`, `EventoDoLeiaute`,
-- `FatoDoPedidoDeAcesso`, `ReservaDeAtendimento`, `ParametroDoAdiantamentoSalarial`,
-- `FolhaDePagamento`, `CampoDoEvento`. Elas NAO se consertam aqui: migration aplicada nao se
-- reescreve, e a correcao pede uma migration propria por tabela. Pendencia nomeada, com o numero
-- medido — e ela estava invisivel enquanto o `deriva` morria antes de reportar.
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaDebitoId_fkey"
  FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaCreditoId_fkey"
  FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaControleDebitoId_fkey"
  FOREIGN KEY ("contaControleDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaControleCreditoId_fkey"
  FOREIGN KEY ("contaControleCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
