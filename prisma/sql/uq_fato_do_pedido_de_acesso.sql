-- V11 V5.3 — AS TRANSIÇÕES QUE NÃO PODEM ACONTECER DUAS VEZES, garantidas NO BANCO.
--
-- ⚠️ POR QUE NO BANCO, SE O DOMÍNIO JÁ RECUSA. O domínio (`registrarFatoDoPedido`) lê os
-- fatos, decide e devolve a recusa com o código próprio — e isso é ler-decidir-gravar. Dois
-- servidores respondendo ao mesmo tempo leem "ainda não respondido" e os dois gravam: o
-- pedido fica com duas respostas entregues, cada uma com a sua data, e o prazo passa a ter
-- duas verdades. A trava do domínio é a que explica; esta é a que impede.
--
-- ⚠️ PARCIAIS, e por isso não são `@unique` no modelo: a restrição vale POR NATUREZA, e um
-- `@unique` sobre (pedidoId, natureza) proibiria também a segunda distribuição e a segunda
-- prorrogação, que são legítimas.
--
-- A idempotência é outra coisa e já está no modelo: `chave` é `@unique` global, com o
-- escopo dentro da string. Ela deduplica a REPETIÇÃO do mesmo ato; estes índices impedem
-- atos DIFERENTES que não podem coexistir.

-- Um pedido é protocolado UMA vez. O fato do protocolo é a certidão de nascimento dele.
CREATE UNIQUE INDEX uq_acesso_protocolado_unico
  ON "FatoDoPedidoDeAcesso" ("pedidoId")
  WHERE "natureza" = 'PEDIDO_PROTOCOLADO';

-- Uma resposta entregue por pedido. Prévia não é resposta: a prévia tem natureza própria e
-- não entra aqui, de propósito — registrar prévias enquanto se redige é o uso normal.
CREATE UNIQUE INDEX uq_acesso_resposta_entregue_unica
  ON "FatoDoPedidoDeAcesso" ("pedidoId")
  WHERE "natureza" = 'RESPOSTA_ENTREGUE';

-- Um encerramento por pedido.
CREATE UNIQUE INDEX uq_acesso_encerramento_unico
  ON "FatoDoPedidoDeAcesso" ("pedidoId")
  WHERE "natureza" = 'PEDIDO_ENCERRADO';

-- Um recurso por instância, e uma decisão por instância. Sem isto, dois recursos de 1ª
-- instância entrariam juntos e a contagem de instâncias usadas passaria a mentir.
CREATE UNIQUE INDEX uq_acesso_recurso_por_instancia
  ON "FatoDoPedidoDeAcesso" ("pedidoId", "instancia")
  WHERE "natureza" = 'RECURSO_INTERPOSTO';

CREATE UNIQUE INDEX uq_acesso_decisao_por_instancia
  ON "FatoDoPedidoDeAcesso" ("pedidoId", "instancia")
  WHERE "natureza" = 'RECURSO_DECIDIDO';
