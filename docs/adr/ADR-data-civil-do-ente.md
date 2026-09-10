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

## ⚠️ O que fica PENDENTE, nomeado

Estes ainda usam `getUTC*` e **não** são formato externo. Não foram tocados neste
lote porque estão fora das quatro áreas que a revisão mandou verificar, e mexer
neles sem teste de fronteira seria trocar um erro conhecido por um desconhecido:

| Sítio | Risco |
|---|---|
| `modules/m08-restos-a-pagar/consultas.ts` | corte de restos a pagar por exercício |
| `modules/m11-licitacoes/dominio.ts` | vigência de contrato |
| `modules/m12-relatorios/rreo-anexo3.ts` | bimestre do RREO |
| `modules/m12-relatorios/rreo-anexo13.ts` | período do demonstrativo |
| `lib/portas/programacao.ts`, `lib/portas/captura.ts` | apresentação |

Pendência: `DATA-CIVIL-RESTANTES`.

## A guarda

`test/data-civil.test.ts` proíbe `getUTCFullYear`/`getUTCMonth`/`getUTCDate` e
`toISOString().slice(0, 10)` em código de domínio **fora de uma lista explícita**.
A lista tem um motivo por linha — e é ela que faz a próxima ocorrência ser uma
decisão de alguém, em vez de um descuido.
