# M11 — Licitações e Contratos (Lei 14.133/2021)

TR 5.96, 5.97, 5.115, 5.117, 5.119.

## O que este bloco (1) entrega

Cadastros e movimentos. **Nenhuma integração com M05/M06** — é o bloco 2.

- `ProcessoLicitatorio` — rol de modalidades **fechado** (art. 28 + arts. 74/75).
- `Contrato` — `processoId` **obrigatório** (dispensa e inexigibilidade são
  modalidades, não a ausência de processo) e `categoriaOrdemCronologica` **reusada**
  do M06 (é daqui que o bloco 2 fará o empenho herdar a categoria).
- `MovimentoContratual` — append-only, com os **6 tipos desde o dia 1** (3 aditivos
  + 3 estornos). Feature sem estorno é assimetria com prazo para virar bug (345af7d).

## Estado é DERIVADO — nunca coluna

| Estado | Como sai |
|---|---|
| valor atual do contrato | `valorInicial + Σ(valor × SINAL_VALOR_CONTRATUAL)` |
| fim da vigência | `vigenciaFimInicial + Σ(dias × SINAL_PRAZO_CONTRATUAL)` dias |
| processo homologado? | `dataHomologacao != null` |
| já estornado? | `estornos.length > 0` |

**Duas dimensões, um movimento.** Cada tipo é **neutro (0)** na dimensão que não é
a dele — senão um `PRORROGACAO_PRAZO` de 90 somaria 90 reais ao contrato. O `CHECK`
(`prisma/sql/ck_movimento_contratual_xor.sql`) diz a mesma coisa em SQL, e pega o
INSERT direto que dribla o Zod.

## O que o bloco 2 entrega (integração M05/M06)

- **`Empenho.contratoId`** (FK nullable) e **`ReservaDotacao.processoId`** (FK
  nullable) — as duas dimensões que faltavam. A **anulação COPIA o `contratoId`**:
  sem isso a soma do empenhado veria o empenho e não veria a anulação dele, e o
  contrato ficaria empenhado para sempre.
- **`HomologacaoProcesso`** — a homologação virou **evento append-only**. A tensão
  declarada no bloco 1 (homologar depois exigiria UPDATE) foi resolvida do jeito de
  sempre: **o fato virou linha**. As duas fontes (cadastro × evento) **nunca
  convivem** — `homologarProcesso()` recusa processo que já trouxe a data no
  cadastro, e a leitura passa por **uma** função (`homologadoEm`).
- **`ReservaDotacao.licitacaoId` FOI DROPADA** (migration destrutiva, manual e
  isolada). Era string sem FK, **escrita e nunca lida**; zero linhas com valor;
  pré-produção. O vínculo de verdade é o `processoId`.
- **Herança de categoria (art. 141)**: o empenho **herda** a categoria do contrato.
  Se o chamador informar uma **divergente**, é **erro nomeado** — nunca sobrescrita
  em silêncio (colocaria o pagamento na fila errada e esconderia o erro de quem
  digitou).

### A inversão de dependência (e por que ela é obrigatória)

O M11 precisa do M05 (o empenhado sai do `Empenho`) **e** o M05 precisa do M11
(vigência e saldo bloqueiam). Import nos dois sentidos seria **ciclo**. O M05 declara
`ContratoPort` (o que ele precisa saber) e o M11 implementa (`adapter-m05.ts`) — o
único ponto do repositório onde os dois se encontram. `criarM05Deps()` segue sem
saber o que é contrato; quem empenha com contrato usa `criarM05DepsComContratos()`.
**Fail-closed**: empenhar COM contrato sem o port ligado **falha** (t9) — nunca
"passa batido".

### ~~Janela declarada~~ ✅ FECHADA NO BLOCO 3

O `ContratoPort` passou a **receber a `tx` do empenho**, e a implementação **trava a
linha do contrato** (`SELECT ... FOR UPDATE`) **antes** de somar o empenhado. Dois
empenhos concorrentes: o segundo espera o primeiro commitar, relê o empenhado já com
ele dentro, e é rejeitado. O t1 roda 5 rodadas de `Promise.allSettled` e exige
**exatamente um** gravado.

⚠️ **O QUE ISSO REVELOU — e é um achado, não uma vitória.** Não havia mecanismo de
concorrência **nenhum** para reusar: o guard do saldo da **ficha** (`exigirSaldo`)
também soma dentro da `tx` **sem lock**, e sob READ COMMITTED dois empenhos
concorrentes contra a **mesma ficha** leem o mesmo disponível e **os dois passam**.
A ficha tem a **mesma corrida** que o contrato tinha — só que ninguém a declarou.
É pendência **do M05**, e o remédio é o mesmo (`FOR UPDATE` na ficha antes de somar).

## Bloco 3 — limites, vínculo de aquisição e relatório

- **`LimiteContratacao`** (TR 5.106): append-only; o vigente numa data é o de **maior
  `vigenciaInicio` <= data**. Decreto novo = linha nova, e o contrato de 2026 continua
  julgado pelo limite de 2026. Dado oficial em
  `prisma/seed/dados/limites-contratacao.ts` (Decreto 12.807/2025).
- **O teto é ESTRITO**: o art. 75 autoriza "valores **inferiores a**". Um contrato
  **igual** ao teto **não** está dispensado (`>=` reprova).
- **Teto real = MIN(oficial, controle interno)**. O ente pode se autolimitar abaixo da
  lei, nunca acima — o Zod barra o inverso.
- **`hipoteseDispensa` mora no PROCESSO, não no Contrato** — e não por gosto: um
  `CHECK` do Postgres **não atravessa tabelas**, e `modalidade` é do processo.
  Pendurada no contrato, a bicondicional "DISPENSA ⟺ hipótese" seria **inexequível no
  banco**. É também onde ela pertence: quem dispensa a licitação é o processo.
- **TR 4.49/5.15**: empenho de **capital com contrato** exige `classeDeBensId`
  (derivação `ehGrupoDeCapital` **reusada** do M10 — grupo 6 nunca exige: capital sem
  bem). E o `adquirirBem` **recusa** incorporar em classe diferente da que o empenho
  prometeu.
- **Relatório 5.103** com **L1/L2/L3**. O `saldoDaLicitacao` **pode ser negativo** (sem
  clamp): contratar acima do licitado acontece, e é justamente o achado.

### Pendências declaradas (bloco 3)

- **TR 4.48 e 4.50 NÃO implementadas**: exigem entidades que **não existem** (módulos
  de **dívida pública** e de **obras/medições**). Sem a fonte-de-verdade não se valida
  — inventá-la seria pior do que não ter.
- **Art. 125 (25%/50%)** segue fora (ver acima) — o do art. 75 é outro limite e este
  sim está implementado.
- **Empenho de capital SEM contrato** não exige classe: o escopo do TR é a cadeia
  licitatória. Uma aquisição fora de contrato (doação, dação) não passa pelo guard.
- **Concorrência da FICHA** (acima): pendência do M05.

### Anulação de empenho é TOTAL

`zAnularEmpenhoInput` não tem campo `valor`, e o estorno copia o valor do original.
**Não existe anulação parcial** neste sistema — quem precisa reduzir um empenho anula
e reempenha o resto. (O t3 prova a devolução com anulação total.)

## Passo 0 — o que o schema já tinha (e o que NÃO tinha)

- **Nada de licitação/contrato existia.** Único vestígio: `ReservaDotacao.licitacaoId
  String?` — uma **string solta, sem FK**, com o comentário *"vínculo futuro com o
  módulo de licitações (M11)"*. **Não foi usada**: ligar o saldo do contrato a uma
  string cuja semântica ninguém escreveu seria adivinhar. O bloco 2 decide se ela
  vira FK ou morre.
- **`Empenho` NÃO tem vínculo a processo/contrato** — só `fichaId`, `subelementoId` e
  a `ReservaEmpenho`. O bloco 2 precisa da coluna (aditiva).
- **Empenho de REFORÇO (TR 5.9) não existe**: `TipoEmpenho` é
  `ORDINARIO | GLOBAL | ESTIMATIVO`, e não há `empenhoOriginalId`. Não foi inventado
  aqui — é dado do M05.

## Pendências DECLARADAS (nenhuma meia-regra de memória)

- **Limites do art. 125 (25% / 50%) NÃO são validados.** O limite tem exceções (o §
  do próprio artigo; o acordo das partes na supressão) e a base de cálculo é o valor
  inicial **atualizado por reajuste** — que este módulo ainda não modela. Uma
  meia-regra barraria aditivo legítimo e deixaria passar o ilegal com a mesma
  convicção. Entra quando a regra vier inteira.
- ~~**`empenhadoLiquidoDoContrato` é soma sobre conjunto vazio**~~ ✅ **PAGO NO BLOCO
  2.** A função nasceu com a **forma final**, e a dívida custou **uma linha**: o corpo
  passou a delegar para `empenhadoLiquidoPorContrato` (M05), e **nenhum chamador
  mudou**. O guard da supressão, que já a chamava, passou a morder sozinho (t5).
- ~~**Homologar DEPOIS do cadastro exigiria um UPDATE**~~ ✅ **RESOLVIDO NO BLOCO 2**:
  `HomologacaoProcesso`, o fato como linha.
- **Sem guard `valorInicial <= valorLicitado`, e é de propósito**: o contrato sai do
  **lance**, que quase sempre vem abaixo da estimativa. A relação entre licitado e
  contratado é assunto de **relatório** (TR 5.103 compara os dois), não de bloqueio.
- **Reajuste/repactuação e rescisão** não existem neste bloco.

## Arquivos

- `dominio.ts` — puro: `MODALIDADES`, `SINAL_VALOR_CONTRATUAL`,
  `SINAL_PRAZO_CONTRATUAL`, `TIPO_DO_ESTORNO`, `valorAtualizado`, `vigenciaFim`,
  `estaVigente`, Zod (o XOR).
- `contratos.ts` — serviços (fail-closed com SELECT dentro da transação) e as
  derivações que leem o banco.
- `prisma/schema/m11-licitacoes.prisma`; `prisma/sql/uq_estorno_contratual_unico.sql`
  e `prisma/sql/ck_movimento_contratual_xor.sql` (⚠️ como todo SQL de `prisma/sql/`,
  precisam ser aplicados **também em dev/prod** — o Prisma não os expressa).
