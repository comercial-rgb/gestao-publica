# M37 — Farmácia pública

Nasceu na V27 para fechar as tabelas do SAGRES §4.56 Farmacia e §4.57 EstoqueFarmacia (leiaute 2026 v1.1). **Não é**
a assistência farmacêutica do termo de referência (5.47: CATMAT, lote e validade, dispensação, BNAFAR): é a base
que a prestação de contas exige.

## Modelo (`prisma/schema/m37-farmacia.prisma`)

- `FarmaciaPublica` (código de até 7 dígitos, único na UG) com `VersaoDaFarmacia` (nome, endereço, responsável
  técnico com CPF conferido e CRF; `ativa = false` encerra a partir da data).
- `InformeDeEstoqueDaFarmacia` com os itens do mês. O informe vem **digitado** ou por **arquivo** (texto
  `codigoProduto;descricao;unidade;quantidade`, com o SHA-256 guardado). Um informe novo do mesmo mês substitui o
  anterior na remessa; o anterior fica guardado.

## Regras

- Qualquer linha inválida do arquivo recusa o informe inteiro, nomeando a linha (`dominio.ts`, leitor puro testado).
- Trava `FarmaciaPublica` (posto 35) antes de numerar a versão e de gravar o informe.

## Ações

`CADASTRAR_FARMACIA` e `INFORMAR_ESTOQUE_DA_FARMACIA`; a atualização de permissões v42 as concede a quem já tem
`REGISTRAR_ENTRADA_ALMOXARIFADO` global. Leitura: `CONSULTAR_PATRIMONIO`. Tela: Patrimônio › Farmácias públicas
(arquivo, ou os produtos digitados um por linha; o que se informa é a posição do mês inteiro). Farmácia encerrada no
fim do mês não recebe informe.

## SAGRES

- §4.56: as farmácias ativas no fim do mês.
- §4.57: o último informe do mês de cada farmácia ativa. Farmácia ativa sem informe: só o arquivo do estoque fica
  fora, nomeando a farmácia; o §4.56 sai.
- Aplicabilidade: o leiaute não diz quem está obrigado. Se o município não mantém farmácia pública sob a UG, nenhuma é
  cadastrada e os dois arquivos saem vazios — isso é decisão do ente, não do sistema.
