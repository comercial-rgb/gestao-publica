# ADR — comparação de data no domínio usa a data civil do ente, nunca UTC

- **Estado:** **aceito**
- **Data da decisão:** 2026-09-10
- **Decidida por:** Winner (proprietário do produto)
- **Contexto do lote:** varredura (c) do ENT03a, disparada pelo achado do OFX
- **Módulo:** `packages/datas`

## O que mostrou o problema

A conferência do `packages/ofx` contra o `ofxtools` mostrou que
`20260131235900[-3:BRT]` é **31/01** no extrato que o tesoureiro tem na mão e
**01/02** lido como instante em Greenwich. **Um dia, na virada do mês.** Numa
conciliação bancária mensal, é a diferença entre fechar e não fechar.

A pergunta que isso levanta não é sobre OFX: é sobre **toda comparação de data do
domínio**. E a varredura achou o mesmo erro em quatro lugares, três deles guards.

## Decisão

**Comparação de data no domínio usa a DATA CIVIL DO ENTE, nunca UTC.**

O instante continua sendo o que se **grava**. A data civil é o que se **compara**
e o que se **imprime**. `packages/datas` é a régua única, e o fuso é parâmetro com
padrão `America/Sao_Paulo` — quando o eixo de município existir, ele sai do
cadastro do ente sem reescrever comparação nenhuma.

⚠️ **Não se crava `-3`.** O Brasil teve horário de verão até 2019 e pode voltar a
ter — é decreto, não física. `Intl.DateTimeFormat` conhece a regra de cada data.

## O que a varredura encontrou, e foi corrigido

| Área | Defeito | Consequência |
|---|---|---|
| **Período fechado** (M16) | a janela de `2026-12` ia de 01/12 00:00Z a 31/12 23:59Z — civilmente **30/11 21:00 a 31/12 20:59** | um lançamento de **31/12 às 22:00** escapava da trava de dezembro; um de **30/11 às 22:00** era travado sem ser dezembro |
| **Período fechado por data** (M16) | a janela era `Date` — um instante para o que é dia civil | "travar de 10/01 a 20/01" começava às 21:00 do dia **09** |
| **Competência** (M04) | `getUTCFullYear()` no guard do exercício da arrecadação | guia de **31/12 às 22:00** recusada como "fora do exercício 2026" — sendo o último dia dele |
| **Competência** (M08) | `getUTCFullYear()` em `exigirCompetenciaEmExercicioAberto` | fato do último dia do exercício conferido contra o exercício errado |
| **Cota mensal do CMD** (M05) | `getUTCMonth()` | empenho de **30/06 às 22:00** contado contra a cota de **julho** |
| **Ordem cronológica** (M06) | comparação por `getTime()` | duas liquidações do mesmo dia **não empatavam**, e o desempate pelo número — que dá ordem total ao art. 141 — **nunca rodava**. A fila virava a ordem de quem digitou primeiro |
| **Vencimento** (M05/M09) | `toISOString().slice(0,10)` no texto do documento | a nota de empenho e o borderô — documentos **assinados** — imprimiam um dia a mais para fatos da noite |

⚠️ **Nenhum deles aparecia nas fixtures**, e a razão é simples: quase toda fixture
do repositório usa **meio-dia UTC**, e ao meio-dia os dois eixos coincidem. Os
testes novos usam horas de noite de propósito.

## O que NÃO muda, e por quê

**Formato externo continua em UTC ou no formato que o órgão manda.** Não é a
mesma pergunta: ali não se está comparando datas do domínio, e sim serializando
para um leiaute de terceiro que define o próprio eixo.

Estes sítios permanecem com `getUTC*`/`toISOString`, deliberadamente:

| Sítio | Por quê |
|---|---:|
| `lib/portas/sagres.ts` | leiaute do TCE-PB |
| `packages/ofx/parser.ts` | o OFX declara o próprio fuso; o parser normaliza na fronteira |
| `modules/m14-exports-federais/manad/*` | leiaute da Receita |
| `modules/m17-banco-bb/*` | leiaute do banco |

## ENT03b — a pendência fechada, e o buraco que ela escondia

`DATA-CIVIL-RESTANTES` nomeava **cinco** sítios. Ao abrir a correção, a medição mostrou
**trinta e cinco**.

⚠️ **A pendência só listava o que a guarda sabia ler.** `test/data-civil.test.ts` procurava
duas formas — a LEITURA por UTC (`getUTCFullYear`) e a IMPRESSÃO por UTC
(`toISOString().slice(0,10)`). A forma **dominante** do defeito não era nenhuma das duas: era
a **construção** da janela por `new Date(Date.UTC(...))`. Em `modules/` e `packages/` havia
35 arquivos assim.

É o caso do `c2` outra vez: uma guarda que dizia vigiar o eixo de data e ficava verde sobre
a metade do eixo que ela não sabia ler. **Buraco na rede é pior que ausência de rede**,
porque a rede dá a sensação oposta.

### O que a segunda varredura encontrou

| Sítio | O que a janela em UTC fazia |
|---|---|
| `rreo-anexo1.janelaDoBimestre` | **régua de OITO anexos do RREO.** O 1º bimestre de 2026 ia de **31/12/2025 às 21:00** a **28/02 às 20:59** civis: três horas do exercício anterior dentro, as três últimas horas do bimestre fora |
| `rreo-anexo3.janelaDosDozeMeses` | a janela da **RCL** — que entra no limite de pessoal e no de endividamento — com as doze bordas mensais deslocadas |
| `guard-cmd.janelaDoMes` | **é guard.** Ele já classificava o empenho pelo mês civil, mas somava o consumido por janela UTC: o empenho de 30/06 às 22:00 era cobrado contra a cota de julho **e não entrava na soma de junho** |
| `m08` (3 cópias de `ultimoInstanteDoExercicio`) | a virada do exercício gravada às 20:59:59 — e o próprio corte dos relatórios de RP no mesmo instante errado |
| `msc/dominio.parsearCompetencia` | o encerramento do exercício caía **fora** da MSC de dezembro e reaparecia como abertura de janeiro: a M3 não fechava e o `beginning_balance` de 2027 trazia orçamento morto |
| `rgf-anexo2/3/4`, `rgf-anexo6`, `mde-vaat`, `mde-diferimento` | cortes de quadrimestre, de bimestre e a janela do art. 25, §3º |
| `m10-patrimonial` (5 sítios) | competência da dívida, da dívida ativa, das provisões e a janela do demonstrativo |
| `m07-extraorcamentario.consultas` | as retenções da virada do ano no exercício errado |
| `ordem-cronologica` (M12) | o pagamento de 30/06 às 22:00 **omitido** da publicação do §3º do art. 141 |
| `m11.diasAteVencimento` | às 10:00 de 30/12, um contrato que vence em 31/12 dizia **2 dias** |
| `m11.vigenciaFim` | prorrogar 150 dias atravessando a virada do horário de verão movia o **dia** do vencimento |
| `m02.gerarDecretoCmd/Mba` | **decreto é documento assinado**, e imprimia um dia a mais para vigência da noite |
| `m26-designer` (3 sítios) | o relatório do desenhista imprimia o dia de Greenwich; e `DIAS(a, b)` contava milissegundos |
| `m20-importador` | a data da planilha importada |

### O que NÃO mudou, e a decisão que isso exigiu

**A MSC saiu da lista de "leiaute externo".** Foi decisão, não descuido: o que o leiaute
define é o **formato** do que se escreve no arquivo; o que a janela decide é **quais fatos
entram na remessa de dezembro** — e essa é pergunta de domínio. O Siconfi recebe uma
*competência*, não um instante. Os adapters de tribunal continuam fora, porque ali a data é
**escrita no arquivo** e o eixo é o que o órgão define.

**`m25-campos-adicionais` continua ancorado em meia-noite UTC**, por decisão registrada no
topo do arquivo: `valorData` é **data pura** — nada compara, soma ou corta período por ela —
e o que importa é que a ida e a volta usem a **mesma** âncora. É a única exceção que não é
formato externo, e `m25-campos-adicionais.test.ts` a prova com datas cujo dia civil e cujo
dia UTC divergem. No dia em que alguém filtrar ou somar por esse campo, a decisão vira
defeito e a âncora precisa virar civil nas duas pontas, com migração.

### A guarda passou a ler as três formas

`PADRAO` agora inclui `Date.UTC(`. A lista de exceções caiu de cinco pendências para **uma**
decisão registrada, mais os leiautes externos.

### ⚠️ E a correção foi PROVADA POR MUTAÇÃO — 11 de 11

`scripts/mutacoes-eixo-de-data.ts` devolve a cada sítio **exatamente o código que estava lá
antes do conserto** e confere que algum teste fica vermelho. Duas mutações ficaram **verdes**
na primeira rodada, e as duas eram achados:

| Mutação | Por que nada acusava |
|---|---|
| `vigenciaFim` de volta a milissegundos | o teste que eu havia escrito prorrogava **365 dias de 30/06/2018 a 30/06/2019** — as duas pontas FORA do horário de verão, onde as duas aritméticas coincidem. Trocado por 150 dias, que **cruzam** a virada de 04/11 |
| `janelaDoBimestre` de volta a `Date.UTC` | **nenhum teste do repositório acusava.** Todos os anexos do RREO passavam, porque as fixtures usam meio-dia. Criado `m12-janelas.test.ts`, que afirma o **instante exato** das bordas — afirmar só o dia civil passaria com 00:00 e com 03:00 locais, e é a hora da borda que decide |

Sítio corrigido sem nada que vigie a volta do defeito vale por hoje e não vale por amanhã.

### O que as fixtures dos testes revelaram

Nove arquivos de teste acusaram, e **em todos a fixture era que estava em Greenwich**:

- `new Date("2026-12-31T23:59:59Z")` como "fim do exercício" é **31/12 às 20:59:59** civis;
- `new Date("2026-01-01T00:00:00Z")` como "primeiro instante do período" é **31/12 às 21:00
  do ano anterior** — o `t6b` do M10 chamava de "primeiro instante" um fato da véspera;
- `new Date("2024-01-01T00:00:00Z")` como início de vigência de PPP publicava o contrato
  começando em **2023**.

Os cortes passaram a ser `janelaCivilDoAno(ano).fim` e `fimDoDiaCivil(dia)` — o teste passa a
dizer *"o fim do exercício do ente"* em vez de um instante literal que precisa ser conferido
de cabeça. E onde a borda importava, entrou o caso que **distingue os dois eixos** (o `t6c`
do M10, o `t3` do M12).

## ⚠️ O que fica PENDENTE, nomeado

`DATA-CIVIL-RESTANTES` está **fechada**. Continua pendente, e é outra pergunta:

| Pendência | O que é |
|---|---|
| `DATA-CIVIL-APRESENTACAO` | `app/**` e `lib/**` ainda imprimem datas por UTC em ~10 sítios. Não é comparação de domínio — é a camada de tela, e a guarda deliberadamente não a varre para não encher a lista de exceções de coisas que não são a mesma pergunta |

## A guarda

`test/data-civil.test.ts` proíbe `getUTCFullYear`/`getUTCMonth`/`getUTCDate` e
`toISOString().slice(0, 10)` em código de domínio **fora de uma lista explícita**.
A lista tem um motivo por linha — e é ela que faz a próxima ocorrência ser uma
decisão de alguém, em vez de um descuido.
