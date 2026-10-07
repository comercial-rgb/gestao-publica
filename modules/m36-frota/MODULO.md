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

## V36 — Multas de trânsito (07/10/2026)

`multas.ts`; schema `prisma/schema/m36-multas.prisma`; tela `/patrimonio/frota/multas` (TR 5.10.1.45).

- **O que se registra:** o veículo (na frota e não baixado no dia da infração), o auto (órgão autuador e número, únicos
  juntos e comparados na forma canônica: sem acento, maiúsculas, separador do órgão como hífen), a data da infração, a da
  notificação (não futura, não anterior à infração), o vencimento, o local, a infração como consta do auto, o valor e o
  INFRATOR: a pessoa física do cadastro único (M19). Sem cadastro de condutor nem CNH: o infrator é `Pessoa`.
- **Os lançamentos de controle:** registro e baixa lançam no subsistema de CONTROLE pelo roteiro que a contabilidade
  declara (família MULTA_DE_TRANSITO do roteiro patrimonial declarado, chaves REGISTRO e BAIXA). Nenhuma conta no código:
  sem a declaração, a multa é recusada dizendo onde declarar. O registro lança na data da notificação.
- **A baixa** (uma por multa): paga pelo ente, ressarcida pelo infrator ou cancelada em recurso lançam pelo roteiro da
  BAIXA, que só é aceito se debitar a conta que o registro DESTA multa creditou (o roteiro é versionado; sem isso uma
  versão nova deixaria o controle das multas antigas aberto). O registro indevido é o ESTORNO do lançamento do registro
  (mesmas contas invertidas, `estornoDeId`), sem depender do roteiro da baixa.
- **Ação:** CADASTRAR_FROTA para registrar e baixar (nenhuma ação nova); leitura CONSULTAR_PATRIMONIO. Quem só consulta
  vê o CPF do infrator mascarado.
- **Trava:** a do veículo (BemDaFrota); o mesmo auto em dois veículos ao mesmo tempo esbarra no índice único e é
  recusado com o motivo.
- **Fora daqui, nomeado:** o pagamento da multa pelo ente segue o empenho do M05, com a natureza que o ente escolher;
  a cobrança do infrator (desconto em folha, guia) não existe no sistema (a reposição ao erário é pendência do M33); a
  tabela de infrações do CTB, a pontuação e o cadastro de condutores (cláusulas da frota) não foram construídos.
  `lancamentoId` da multa e da baixa não tem chave estrangeira para o razão (o vínculo é `origemTipo`/`origemId`).

Teste: `m36-multas.test.ts` t1 a t9 (N=2 infratores; sem roteiro; recusas com o motivo; autorização; auto em forma
canônica; notificação futura e dia inexistente; baixa que não fecha o registro e o estorno do registro indevido;
competência travada; corrida no índice único). Percurso: `scripts/percurso-v36-multas-de-transito.mts`.
