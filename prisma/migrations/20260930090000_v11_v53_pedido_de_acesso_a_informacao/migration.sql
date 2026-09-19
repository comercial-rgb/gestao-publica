-- V11 V5.3 — O PEDIDO DE ACESSO À INFORMAÇÃO E OS SEUS FATOS.
--
-- Aditiva: 3 enums, 2 tabelas, 6 CHECKs, zero DROP, zero seed. O pedido é executado por um
-- Processo do M21 (`processoId` UNIQUE); os fatos são append-only, com a chave de
-- idempotência carregando o escopo dentro dela.
--
-- ⚠️ OS ÍNDICES ÚNICOS PARCIAIS NÃO ESTÃO AQUI: eles vivem em `prisma/sql/`, que é onde o
-- repositório guarda o que o Prisma não representa, e `npm run db:sql` os aplica. São eles
-- que impedem a transição incompatível sob concorrência.

CREATE TYPE "NaturezaDoFatoDoPedidoDeAcesso" AS ENUM (
  'PEDIDO_PROTOCOLADO', 'PEDIDO_DISTRIBUIDO', 'PEDIDO_RECEBIDO', 'PRORROGACAO_CONCEDIDA',
  'RESPOSTA_PREVIA_REGISTRADA', 'RESPOSTA_ENTREGUE', 'RECURSO_INTERPOSTO', 'RECURSO_DECIDIDO',
  'PEDIDO_ENCERRADO'
);

CREATE TYPE "ClassificacaoDaRespostaDeAcesso" AS ENUM ('ACESSO_CONCEDIDO', 'ACESSO_PARCIAL', 'ACESSO_NEGADO');

CREATE TYPE "ResultadoDoRecursoDeAcesso" AS ENUM ('PROVIDO', 'PROVIDO_EM_PARTE', 'DESPROVIDO');

CREATE TABLE "PedidoDeAcessoAInformacao" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "protocoladoEm" TIMESTAMP(3) NOT NULL,
  "configuracaoVersao" INTEGER,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPor" TEXT NOT NULL,
  CONSTRAINT "PedidoDeAcessoAInformacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PedidoDeAcessoAInformacao_processoId_key" ON "PedidoDeAcessoAInformacao"("processoId");
CREATE INDEX "PedidoDeAcessoAInformacao_configuracaoVersao_idx" ON "PedidoDeAcessoAInformacao"("configuracaoVersao");
CREATE INDEX "PedidoDeAcessoAInformacao_protocoladoEm_idx" ON "PedidoDeAcessoAInformacao"("protocoladoEm");

ALTER TABLE "PedidoDeAcessoAInformacao"
  ADD CONSTRAINT "PedidoDeAcessoAInformacao_processoId_fkey"
  FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A versão é um número de versão: 1, 2, 3... Zero ou negativo não nomeia configuração nenhuma.
ALTER TABLE "PedidoDeAcessoAInformacao"
  ADD CONSTRAINT "ck_pedido_acesso_versao_positiva"
  CHECK ("configuracaoVersao" IS NULL OR "configuracaoVersao" >= 1);

CREATE TABLE "FatoDoPedidoDeAcesso" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "natureza" "NaturezaDoFatoDoPedidoDeAcesso" NOT NULL,
  "ator" TEXT NOT NULL,
  "em" TIMESTAMP(3) NOT NULL,
  "dia" VARCHAR(10) NOT NULL,
  "configuracaoVersao" INTEGER,
  "chave" TEXT NOT NULL,
  "mensagemAoRequerente" TEXT,
  "fundamentoInterno" TEXT,
  "setorDestinoId" TEXT,
  "documentoId" TEXT,
  "classificacao" "ClassificacaoDaRespostaDeAcesso",
  "instancia" INTEGER,
  "resultadoDoRecurso" "ResultadoDoRecursoDeAcesso",
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FatoDoPedidoDeAcesso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FatoDoPedidoDeAcesso_chave_key" ON "FatoDoPedidoDeAcesso"("chave");
CREATE INDEX "FatoDoPedidoDeAcesso_pedidoId_em_idx" ON "FatoDoPedidoDeAcesso"("pedidoId", "em");
CREATE INDEX "FatoDoPedidoDeAcesso_processoId_idx" ON "FatoDoPedidoDeAcesso"("processoId");
CREATE INDEX "FatoDoPedidoDeAcesso_natureza_idx" ON "FatoDoPedidoDeAcesso"("natureza");
CREATE INDEX "FatoDoPedidoDeAcesso_setorDestinoId_idx" ON "FatoDoPedidoDeAcesso"("setorDestinoId");
CREATE INDEX "FatoDoPedidoDeAcesso_documentoId_idx" ON "FatoDoPedidoDeAcesso"("documentoId");

ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "FatoDoPedidoDeAcesso_pedidoId_fkey"
  FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeAcessoAInformacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "FatoDoPedidoDeAcesso_processoId_fkey"
  FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "FatoDoPedidoDeAcesso_setorDestinoId_fkey"
  FOREIGN KEY ("setorDestinoId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "FatoDoPedidoDeAcesso_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "Anexo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A chave carrega o escopo DENTRO dela. Sem isto, uma chave "resposta-1" de outro pedido
-- seria aceita e o replay responderia a este pedido o resultado de outro.
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_chave_com_escopo"
  CHECK ("chave" = 'acesso:' || "pedidoId" || ':' || "natureza"::text || ':' || split_part("chave", ':', 4));

-- O dia civil gravado tem o formato da régua (`packages/datas`), não um texto qualquer.
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_dia_civil"
  CHECK ("dia" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- A DISTRIBUIÇÃO tem setor de destino; os outros fatos não. Um destino solto num fato que
-- não distribui é informação sem significado, e alguém a leria como se tivesse.
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_setor_so_na_distribuicao"
  CHECK (("natureza" = 'PEDIDO_DISTRIBUIDO') = ("setorDestinoId" IS NOT NULL));

-- A RESPOSTA ENTREGUE tem classificação; os outros fatos não.
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_classificacao_so_na_resposta"
  CHECK (("natureza" = 'RESPOSTA_ENTREGUE') = ("classificacao" IS NOT NULL));

-- A INSTÂNCIA existe nos dois fatos do recurso, e só neles. E é 1, 2, 3...
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_instancia_so_no_recurso"
  CHECK (
    ("natureza" IN ('RECURSO_INTERPOSTO', 'RECURSO_DECIDIDO')) = ("instancia" IS NOT NULL)
    AND ("instancia" IS NULL OR "instancia" >= 1)
  );

-- O RESULTADO existe só na decisão do recurso.
ALTER TABLE "FatoDoPedidoDeAcesso"
  ADD CONSTRAINT "ck_fato_acesso_resultado_so_na_decisao"
  CHECK (("natureza" = 'RECURSO_DECIDIDO') = ("resultadoDoRecurso" IS NOT NULL));
