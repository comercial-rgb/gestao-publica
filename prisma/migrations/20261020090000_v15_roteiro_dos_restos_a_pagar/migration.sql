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

-- ⚠️ `ON DELETE RESTRICT`, E A HISTORIA DESTA LINHA VALE MAIS QUE ELA.
--
-- O `npm run deriva`, na primeira execucao depois de consertado, acusou as quatro FKs desta
-- tabela: 52 instrucoes, 16 delas deste modelo. Meu primeiro conserto foi trocar por `SET NULL`,
-- porque e o que o Prisma assume para relacao opcional — e a deriva sumiu. **Conserto errado pela
-- via facil.** O Prisma assume `SET NULL` quando NINGUEM DECLARA; este repositorio declara, onze
-- vezes, e declara `Restrict` — inclusive nas referencias a VERSAO DE ROTEIRO e a PARAMETRO
-- (`m10-patrimonial.prisma`), que sao exatamente desta natureza. O BANCO ESTAVA CERTO; o que
-- faltava era o SCHEMA declarar o comportamento.
--
-- E a direcao importa. Com `SET NULL`, apagar uma conta do plano ANULARIA EM SILENCIO a referencia
-- de um roteiro publicado — e um roteiro com conta nula destroi a resposta a "contra que contas
-- este fato foi escriturado?", que e a razao pela qual esta tabela e versionada. Com `Restrict`, a
-- conta apontada por um roteiro nao se apaga: publica-se versao nova.
--
-- ⚠️ E A DERIVA RESTANTE NAO E DAQUI: 36 instrucoes, oito tabelas, MESMO padrao — schema que nao
-- declarou `onDelete` onde a migration escreveu `RESTRICT`. `ReceitaArrecadada`,
-- `DecisaoDoTipoDeConsignacao`, `EventoDoLeiaute`, `CampoDoEvento`, `FatoDoPedidoDeAcesso`,
-- `ReservaDeAtendimento`, `ParametroDoAdiantamentoSalarial`, `FolhaDePagamento`. Cada uma se
-- conserta com UMA LINHA no schema, sem migration nova e sem `DROP CONSTRAINT`. Pendencia nomeada,
-- com o tamanho e o remedio medidos — e ela estava invisivel enquanto o `deriva` morria.
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaDebitoId_fkey"
  FOREIGN KEY ("contaDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaCreditoId_fkey"
  FOREIGN KEY ("contaCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaControleDebitoId_fkey"
  FOREIGN KEY ("contaControleDebitoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoteiroRestosAPagar" ADD CONSTRAINT "RoteiroRestosAPagar_contaControleCreditoId_fkey"
  FOREIGN KEY ("contaControleCreditoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
