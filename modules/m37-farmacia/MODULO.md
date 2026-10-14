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

## V39-R3 (R3-022, V39-072) — a posição mensal calculada dos movimentos

`informe-calculado.ts`; tela Patrimônio › Farmácias públicas (por farmácia: "Mudar de onde vem a posição do mês" e
"Posição calculada dos movimentos: códigos no informe e cálculo do mês").

- **Modo adotado** (`ModoDoInformeAdotado`, append-only, por farmácia a partir de um mês): IMPORTADO (digitado ou
  arquivo, o que já era; vale sem adoção) ou CALCULADO. Cada mês tem UMA fonte, a do modo daquele mês
  (`origensDoModo`, a mesma regra na remessa e na tela). A adoção NÃO alcança mês que já tem posição (informada,
  importada ou calculada, talvez já remetida): recusa nomeando o último mês com posição e o primeiro possível.
- **A remessa** (`lerFatosEstoqueFarmacia`, SAGRES § 4.57) lê o informe mais recente da fonte do modo do mês, nunca
  o mais recente de qualquer fonte; no modo calculado sem a posição gerada, recusa nomeando a farmácia e o motivo. O
  informe importado de mês anterior à adoção continua valendo (importação histórica) e nada se soma.
- **Digitar ou importar** num mês calculado recusa (seria ignorado calado).
- **O cálculo** (`calcularInformeDaFarmacia`, mês terminado): depósito da farmácia no último dia do mês
  (`depositoDaFarmaciaNoDia`), quantidade de cada material por `posicaoDoMaterial` — sem aritmética própria. Posição
  zero não entra; negativa recusa; mês sem nenhum estoque não se grava (a
  remessa recusaria calada); a farmácia tem de existir e estar ativa no mês, como no informar. Recalcular igual devolve o mesmo informe; diferente (movimento registrado depois)
  grava outro, e vale o mais recente. Origem CALCULADO no informe, com o fundamento (dia e depósito).
- **Código do produto no informe** (`CodigoDoMaterialNoInforme`, append-only, vale o mais recente): o código (de
  preferência o GTIN) e a descrição de até 60 caracteres, declarados pelo ente para cada material. O material não tem
  GTIN e o sistema não o deduz do código interno nem do CATMAT: material com estoque e sem código recusa o cálculo,
  nomeado. O mesmo código em dois materiais recusa na declaração e, se uma corrida passar, no cálculo.
- Poder: INFORMAR_ESTOQUE_DA_FARMACIA para adotar, declarar e calcular (nenhuma ação nova); os formulários, inclusive o
  de informar o estoque, só aparecem para quem a tem.

Pendências nomeadas (R3-022):
- `POSICAO-ARREDONDA-QUANTIDADE` (M10): `posicaoDeEstoque` passa cada quantidade (4 casas no razão físico) por `toMoney`,
  que arredonda a 2. O cálculo da farmácia recusa depósito com movimento de mais de 2 casas em vez de confiar nisso;
  a correção é do M10.
- `CALCULO-SEM-TRAVA-DA-POSICAO`: o cálculo trava a farmácia, não a posição de cada material; um movimento com data no
  mês registrado durante o cálculo fica para o recálculo (que grava outro informe e passa a valer).
- `ADOCAO-SO-PARA-FRENTE`: adoção errada (mês ou modo) se corrige adotando de novo a partir de outro mês ainda sem
  posição; não há anulação da adoção.
- `CODIGO-NO-INFORME-SEM-VIGENCIA`: o código do produto vale o mais recente, sem data; recalcular um mês antigo depois
  de mudar o código grava o código novo.
- `VINCULO-DO-DEPOSITO-SEM-DATA`: `DepositoDaFarmacia` não tem início de vigência; para meses antes do vínculo, o
  cálculo usa o depósito vinculado (a posição vazia recusa).
- `INFORME-PARA-O-BNAFAR`: o informe calculado alimenta o SAGRES; o BNAFAR depende do manual de integração do
  SI-BNAFAR, que exige credencial do DATASUS (FONTE-BNAFAR-MANUAL-DE-INTEGRACAO).
- `UNIDADE-DO-INFORME`: a unidade do item é a sigla da unidade de estoque do material; a conversão para outra unidade
  de dispensação não é feita.
