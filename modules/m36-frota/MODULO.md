# M36 — Frota

Nasceu na V27 para fechar as tabelas do SAGRES §4.50 a §4.55 (leiaute 2026 v1.1): proprietário, locador, veículo,
máquina, situação no mês e abastecimento. **Não é** o bloco inteiro de frota do termo de referência (5.20: ordem de
abastecimento, manutenção, multas, CNH, hodômetro, estoque de combustível): é a base que a prestação de contas exige.

## Modelo (`prisma/schema/m36-frota.prisma`)

- `VeiculoDaFrota` (placa única) e `MaquinaDaFrota` (código único na UG), sempre de uma UG **escriturada aqui**.
- Dados, tipo de frota, dono, locador e combustível principal vivem em **versões** (`VersaoDoVeiculo`,
  `VersaoDaMaquina`). O leiaute manda reenviar o cadastro quando muda: a versão que começa no mês vai no mês.
- Dono e locador são `Pessoa` do cadastro único (M19). **No bem próprio o dono é a UG**: `proprietarioId` nulo, e o
  arquivo usa o CNPJ da remessa (o da UG, ou o da entidade que a escritura). Nunca o CNPJ do município para Câmara,
  fundo ou autarquia.
- Situação (`MudancaDeSituacaoDaFrota`) e abastecimento (`AbastecimentoDaFrota`) são append-only; o errado se anula
  com motivo.
- CHECKs no banco: placa, RENAVAM com 11 dígitos, modelo com até 6, dono nulo se e somente se próprio, locador presente
  se e somente se locado ou prestação de serviços, um bem por registro, quantidade positiva.

## Regras do serviço (`servico.ts`)

- Cadastro cria a versão 1 e a situação inicial no mesmo dia. Pessoa ausente: recusa dizendo onde cadastrar.
- Situação: não antes da entrada na frota, uma por dia, nenhuma depois de outra posterior, nenhuma depois da baixa
  (anule a baixa se foi engano). A primeira situação não se anula.
- Abastecimento: só de bem na frota no dia e não baixado; quantidade positiva com até 2 casas (o numérico de 16
  posições do leiaute tem 2 decimais; nada é arredondado).
- Trava `BemDaFrota` (posto 34) antes de ler o estado.

## Ações

`CADASTRAR_FROTA` (cadastro, versões, situação e anulação) e `REGISTRAR_ABASTECIMENTO` (abastecimento e anulação).
A atualização de permissões v42 concede as duas a quem já tem `CADASTRAR_BEM` **global** (os atos são do ente; uma
concessão por unidade não abriria nada). Leitura:
`CONSULTAR_PATRIMONIO`. Tela: Patrimônio › Frota.

## SAGRES (`adapters/tribunais/tce-pb/sagres/gerador-frota-farmacia.ts`)

- §4.50/§4.51/§4.52/§4.53: cada versão vai no mês em que foi **registrada**, ou no mês em que começa se começa depois
  (a última do mês por bem), com o dono e o locador citados. O veículo em uso há anos cadastrado na implantação vai no
  mês da implantação; ele não some por ter data de início antiga.
- §4.54: todo bem com situação até o fim do mês — a do dia 1 (data 01/mm) e cada mudança, na data em que começou.
- §4.55: por bem e combustível, a soma do mês; sem abastecimento, o registro com quantidade zero no combustível
  principal, exceto o bem baixado o mês inteiro.
- Recusa nomeada: veículo sem o número do modelo da tabela do Tribunal deixa **só** o arquivo de veículos fora.

## Limites conhecidos

- A placa é única no sistema e o veículo não muda de unidade gestora: passar um veículo para outra UG escriturada aqui
  ainda não está disponível (a recusa diz isso).
- Abastecimento ou anulação retroativos mudam um mês já remetido sem aviso: não há guarda de competência remetida.
- A baixa não pode começar antes de um abastecimento já registrado; o inverso (abastecer bem baixado) também é recusado.

## Pendência nomeada

`TABELA-MODELO-VEICULO-TCE`: a "Tabela de modelo do veículo" citada no §4.52 não está nos documentos oficiais obtidos
(nem nas tabelas de domínio do Captura 2.0). O número é digitado como consta no Tribunal; o sistema confere só o
formato. Sem ele, o veículo fica nomeado na prévia.
