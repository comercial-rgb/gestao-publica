# M03 — créditos adicionais

Alterações da LOA por crédito suplementar, especial e extraordinário
(TR 4.20–4.40). **Status: concluído.**

REUSA o mecanismo de saldo do M05 — `MovimentoDotacao` append-only + colunas
cache recalculadas por SUM. Nada de aritmética de saldo é reimplementada aqui:
cada item de crédito vira um `MovimentoDotacao` (`CREDITO_ADICIONAL` na ficha
suplementada, `ANULACAO_CREDITO` na anulada), e o cache é recalculado na mesma
transação.

## Requisitos TR cobertos

- TR **4.20–4.40** — créditos adicionais.
- TR **4.30** — o decreto não pode ultrapassar o TETO da lei que o autoriza.
- TR **5.111** — o crédito por anulação tem de fechar **por fonte**.

## Depende de

- **M05** — `MovimentoDotacao`, `garantirDotacaoInicial`, `totaisPorTipo`,
  `recalcularCache`, `calcularSaldos`. (Estes quatro foram **exportados** do M05,
  que antes os mantinha privados. Aditivo puro: nenhum comportamento mudou.)
- **M02** — `FichaOrcamentaria`, `FonteRecurso`.
- **M01** — `criarPrismaClient()`, `IdPort`.

## Invariantes (NUNCA violar)

1. **Decimal(18,2). APPEND-ONLY** — lei, decreto, item e encerramento são
   registros imutáveis. Anular = itens NOVOS invertidos, o original intacto.
2. **BALANCEAMENTO DO CRÉDITO POR ANULAÇÃO** — o "partidas dobradas da dotação":
   `Σ(anulações) == Σ(suplementações)`, **no total E em cada fonte** (TR 5.111).
   Não fecha = REJEITA, **antes de abrir transação** (é checagem de domínio puro).
   Por fonte, e não só no total, porque anular fonte carimbada (FUNDEB) para
   suplementar fonte livre fecharia no total e **furaria a vinculação** do recurso.
3. **FAIL-CLOSED** — não se anula o que já foi empenhado (saldo disponível pelo
   **SUM real**, dentro da transação). Suplementar além do teto da lei = REJEITA
   (TR 4.30). Crédito por recurso novo além da disponibilidade declarada = REJEITA.
4. **Saldo via `MovimentoDotacao`** (reuso M05). `reconciliarFicha()` das fichas
   afetadas tem de dar `[]` — testado nas duas pontas de cada anulação.
5. **Recurso novo não tem perna de anulação** — o dinheiro vem de fora, não de
   outra ficha. Um decreto por superávit/excesso/operação de crédito com item de
   ANULAÇÃO é rejeitado.

## Decisões conscientes

- **NÃO existe coluna `status` no decreto.** "Encerrado?" é DERIVADO da existência
  de um `DecretoEncerramento` — mesmo padrão do estorno no ledger e do status do
  empenho no M05. Uma coluna `status` exigiria UPDATE no decreto (append-only
  proíbe), e o encerramento é um **fato** (alguém encerrou, numa data, por um
  motivo), não um atributo.
- **`DisponibilidadeRecursoNovo` foi CRIADA — não estava no spec.** O spec mandava
  "validar saldo da fonte de superávit/excesso", mas **não havia nada no sistema
  contra o que validar**. Sem esta tabela, o invariante 5 seria uma checagem que
  sempre passa — pior que não ter. Aqui se **declara** a disponibilidade apurada
  (superávit do balanço anterior, excesso de arrecadação, valor da operação de
  crédito contratada), e o crédito não pode ultrapassá-la. "Um crédito por recurso
  novo não pode sair do nada."
- **A fonte do item TEM de bater com a fonte da ficha.** Sem isso, alguém declara
  fonte 500 numa ficha de fonte 540 e o balanceamento "por fonte" da TR 5.111
  passa a checar uma **ficção**. Checado no adapter.

## As TRÊS amarrações do recurso novo (TR 4.37 — completo)

| Origem | Derivada de | `null` (fail-open) quando | Zero (barra) quando |
|---|---|---|---|
| `SUPERAVIT_FINANCEIRO` | superávit da fonte no encerramento de E-1 (M12) | E-1 não foi encerrado | a fonte não sobrou nada |
| `EXCESSO_ARRECADACAO` | `max(0, arrecadado líquido até a data do decreto − previsão da fonte)` (M04 + M02) | a fonte **não tem previsão** cadastrada | arrecadou **menos** do que previu |
| `OPERACAO_CREDITO` | arrecadado líquido na fonte com natureza de **origem 2.1** (M04) | — (a resposta sempre existe) | a fonte não recebeu empréstimo nenhum |

O `AMARRACAO_DA_ORIGEM` é um **Record exaustivo**: uma origem nova no enum **não compila**
até alguém dizer contra o que ela é conferida. Sem isso, o valor novo cairia num `if` que
ninguém escreveu e entraria no orçamento sem lastro, em silêncio.

- **O excesso é o REALIZADO, sem tendência.** O art. 43 § 3º permite projetar o que ainda
  vai entrar; isso está deliberadamente **fora**. Projetar exige um método oficial (o MBA
  da STN dá mais de um), e escolher um aqui seria **inventar o número que autoriza a
  despesa**. O guard usa o que já entrou — o limite mais apertado, e o único que não
  depende de uma previsão sobre a previsão. **Afrouxar é decisão de política contábil, não
  de código**: quando o método vier, ele entra no port, e o chamador não muda.
- **Fonte sem previsão ≠ excesso zero.** Sem previsão, `arrecadado − previsto` não tem
  minuendo. Tratar a ausência como previsão zero faria **todo** o arrecadado virar excesso
  — o número mais generoso possível, tirado justamente do dado que falta. É `null`:
  fail-open com log. Já **arrecadar menos do que se previu é uma RESPOSTA** (excesso zero),
  e ela barra.
- **Operação de crédito é o que ENTROU, não o que o contrato promete.** Um contrato de 10
  milhões com 2 liberados lastreia 2. E o recorte é pela **origem** (2º dígito): o convênio
  (2.4) e a alienação (2.2) entram na fonte pelo **mesmo caixa** e não lastreiam — ninguém
  tem de devolvê-los. Provado por mutação: sem o recorte, o convênio de 30.000 virava
  empréstimo.
- **A previsão "atualizada" é a inicial** — não há reprevisão no modelo, e o Anexo 10 já
  emite as duas colunas com o mesmo número dizendo por quê. A `previsaoPorFonte` herda a
  pendência e é o lugar onde ela será absorvida sem que o chamador mude.
- **`arrecadadoPorFonte` ganhou um RECORTE, não uma soma nova.** O filtro por origem é um
  parâmetro da **mesma** função (e é feito em JS, porque a origem não é prefixo do código —
  o dígito "1" é imposto na corrente e operação de crédito na de capital). Duas somas do
  mesmo dinheiro divergem no dia em que só uma aprende o caso novo: foi a lição das três
  cópias do líquido (50783ae).

## A amarração do SUPERÁVIT FINANCEIRO (TR 4.37/4.39)

A `DisponibilidadeRecursoNovo` é **declarada**: alguém digita "o superávit da fonte 500
foi 20.000" e o sistema acredita. Até este bloco, ela era a **única** coisa contra a qual
o crédito por recurso novo era validado — e **nada a conferia**. Um zero a mais na
digitação virava crédito adicional sem lastro, e o orçamento crescia contra um dinheiro
que nunca existiu (art. 43, § 1º, III da Lei 4.320/64).

O `SuperavitFinanceiroPort` fecha isso: o M03 faz a **pergunta** ("quanto a fonte F tinha
de superávit no encerramento de E-1?") e o M12 — dono da aritmética do Anexo 14 —
**responde**, compondo o **mesmo** `linhasDoSuperavitPorFonte` que o relatório publica.
Zero segunda aritmética; a seta aponta só de `m12 → m03`, sem ciclo (mesmo desenho do
`ContaReservadaPort` do M04).

- **O guard compara contra o DERIVADO, não contra o declarado** — e por isso pega os
  dois erros: a **inflação** (declararam 20.000 onde os fatos dão 10.000) e a **redução**
  (o superávit derivado caiu, porque um fato de E-1 foi lançado depois do encerramento, e
  o que já se usou não cabe mais). Um guard contra o declarado conferiria a declaração
  contra ela mesma.
- **O encerramento é a CONDIÇÃO; o corte é 31/12 de E-1.** O `EncerramentoExercicio` só
  tem `criadoEm` — e ele cai em janeiro, fevereiro, às vezes março. Usar essa data como
  corte puxaria a receita de janeiro de E para dentro do superávit de E-1, e o dinheiro
  do exercício novo lastrearia crédito do exercício novo, contado duas vezes.
- **`null` não é zero.** `null` = não há resposta (port desligado, ou E-1 não encerrado)
  → **fail-open com log** `SUPERAVIT_SEM_AMARRACAO` (precedente do `ContaReservadaPort`:
  um módulo não montado não pode paralisar o ente, e o art. 43 não proíbe o crédito —
  proíbe o crédito *sem lastro*). Zero = a resposta **é** zero → o guard barra. Confundir
  os dois transformaria um sistema sem o port ligado num sistema que rejeita tudo.
- **Lock na `DisponibilidadeRecursoNovo` (posto 2, logo depois da ficha).** O
  `travarFichas` **não** cobria esta corrida: dois decretos podem suplementar fichas
  **diferentes** da mesma fonte e nunca se cruzar — cada um lê `usado` no mesmo estado, e
  os dois passam. Com o lock, exatamente um grava (provado por mutação: sem ele, dois
  créditos de 6.000 gravam contra um superávit de 10.000).

⚠️ **NÃO existe logger no repositório.** O fail-open usa `console.warn` com um payload
JSON estruturado — é o único ponto do sistema que loga. Quando houver logger de verdade,
é aqui que ele entra.

## Pendências / bugs conhecidos

- ~~**BUG: ficha nunca tocada reporta saldo autorizado ZERO.**~~ **CORRIGIDO na
  Parte 5-fix**: a `DOTACAO_INICIAL` passou a ser criada **junto com a ficha**
  (adapter do M02), na mesma transação. Toda ficha nasce com a dotação registrada,
  e o cache nasce correto. Unicidade garantida pelo índice parcial
  `uq_dotacao_inicial_unica`.
- ~~**BUG: anular um decreto NÃO devolvia o teto da lei nem a disponibilidade da
  fonte.**~~ **CORRIGIDO neste bloco.** O item de estorno nasce com o tipo
  **invertido** (`anularCredito`: uma `SUPLEMENTACAO` anulada vira um item `ANULACAO`
  apontando para ela), e as duas somas — `consumido` (teto da lei) e
  `usadoDaDisponibilidade` (fonte) — filtravam `tipo: "SUPLEMENTACAO"` **no SQL**. O
  estorno **não voltava da query**, o conjunto `estornados` saía vazio, e o item
  original continuava somando. Uma lei de 20.000 gasta num decreto de 20.000 **anulado**
  não autorizava mais um centavo, para sempre. Nenhum teste pegava porque nenhum somava
  o teto **depois** de uma anulação — os testes de anulação conferiam os saldos das
  fichas, e esses estavam certos. A cura: filtrar pelo tipo do **ALVO**, não pelo tipo da
  linha, e deixar o `packages/estornaveis` (a soma única) fazer o resto.
- ~~**A disponibilidade era buscada com `findFirst` sem `exercicio`**~~, embora a chave da
  tabela seja `[exercicio, fonteId, origem]`, e o `usado` somava itens de **todos** os
  anos. Com duas disponibilidades declaradas (2026 e 2027), o guard comparava o crédito de
  um ano contra a declaração de outro. **Corrigido**: `findUnique` pela chave composta com
  `decreto.ano`, e o `usado` filtrado pelo mesmo ano. O superávit é a foto do encerramento
  de **um** exercício; ele não atravessa anos.
- ~~**`EXCESSO_ARRECADACAO` e `OPERACAO_CREDITO` continuam sem amarração.**~~ **FECHADO** —
  os dois ports acima. A TR 4.37 está completa: **nenhuma** origem de recurso novo entra no
  orçamento sem ser conferida contra os fatos.
- **A TENDÊNCIA do art. 43 § 3º segue fora, e é a única pendência do excesso.** Ver acima:
  o guard usa o realizado. Afrouxar exige método oficial.
- **`previsaoTotal` (M04, por natureza) ainda usa `aggregate/_sum`** — código antigo. Ele
  funciona porque ali não há sinal a aplicar; a `previsaoPorFonte` (M02) **não** podia usar,
  porque a DEDUÇÃO subtrai, e um `_sum` inflaria o previsto da fonte e **esconderia** o
  excesso de arrecadação.
- ~~`LeiCredito.percentualLimite` é gravado mas não é usado~~ — **V35: usado.** Ver a seção do limite da LOA abaixo.

## Arquivos deste módulo

- `prisma/schema/m03-creditos.prisma` — `LeiCredito`, `DecretoCredito`,
  `DecretoEncerramento`, `ItemCredito`, `DisponibilidadeRecursoNovo`; enums
  `TipoCredito`, `OrigemRecurso`, `TipoItemCredito`.
- `prisma/sql/uq_estorno_item_credito.sql` — índice único parcial (um estorno por
  item).
- `modules/m03-creditos/dominio.ts` — `validarBalanceamento` (o coração, **puro**),
  Zod. **Sem I/O.**
- `modules/m03-creditos/ports.ts` — as três PERGUNTAS (`SuperavitFinanceiroPort`,
  `ExcessoArrecadacaoPort`, `OperacaoCreditoPort`) e o `PortasDoRecursoNovo`.
- `modules/m03-creditos/servico.ts`, `adapter-prisma.ts` (`AMARRACAO_DA_ORIGEM`,
  `amarrar`), `index.ts`.
- `modules/m12-relatorios/adapter-m03.ts` — as três RESPOSTAS, compondo os donos, e o
  `criarM03DepsAmarrado`.
- `modules/m02-planejamento/consultas.ts` — `previsaoPorFonte` (dono da `ReceitaPrevista`).
- `modules/m03-creditos/m03.test.ts`, `m03-superavit.test.ts` (6),
  `m03-recurso-novo.test.ts` (8).

## Fora de escopo aqui

- **PPA / LDO / LOA** → M02.
- **Empenho sobre o crédito** → M05 (há teste de integração provando que o crédito
  vira saldo empenhável de verdade).
- **Limites constitucionais** → módulo de relatórios.

## Realocação por lei específica — remanejamento, transposição e transferência (V21)

Constituição, art. 167, VI: mover dotação de uma programação para outra, ou de um órgão para
outro, só com autorização legislativa prévia. Arquivos: `realocacao.ts` (domínio e caso de uso),
`adapter-realocacao.ts`, `consultas-realocacao.ts`; tela `/planejamento/realocacoes`.

- **Não é crédito adicional, e por isso não é um quarto `TipoCredito`.** Não traz recurso novo,
  não consome o teto de `LeiCredito`, e no plano mora em `5.2.2.1.9.02 ALTERAÇÃO DA LEI
  ORÇAMENTÁRIA` (ACRÉSCIMO `.01` / REDUÇÃO `.09`), não em `5.2.2.1.2`. Tem tipos próprios de
  movimento: `REALOCACAO_ACRESCIMO` e `REALOCACAO_REDUCAO`, com roteiro próprio (semeado das
  analíticas oficiais, trocável na tela de roteiros orçamentários).
- **Um ato, indivisível**: nasce com as pernas, na mesma transação. Σ acréscimo == Σ redução no
  total e em cada fonte (a soma é o `somarItens` do crédito por anulação). Uma ficha aparece uma
  vez. A lei tem de ser anterior ou do mesmo dia civil do ato. Fichas do exercício do ato, em
  exercício aberto. A ficha só cede o disponível corrente (nem empenhado, nem reservado).
- **A espécie é declarada, não deduzida**: a lei diz se é remanejamento, transposição ou
  transferência. O sistema não recusa por "espécie incoerente com as fichas" — isso seria norma
  inventada.
- **Desfazer** grava `AnulacaoDeRealocacao` (uma por ato) e uma perna invertida por perna, e o
  lançamento é o ESTORNO EXATO do original (`estornarMovimentoDotacao`, M05: mesmas contas, lados
  trocados). Pelo roteiro do tipo oposto as duas analíticas ficariam infladas — o t9 prova que
  voltam a zero. Não se desfaz se a ficha que recebeu já comprometeu o que ganhou.
- **Leitores que passaram a enxergar**: QDD (colunas de realocação; atualizada via `SINAIS`),
  Anexo 12 (coluna (f)/(g), com `switch` agora exaustivo), e o MANAD, que **recusa** gerar o L250
  para ficha com realocação — o leiaute não tem campo para ela
  (pendência `MANAD-SEM-CAMPO-PARA-REALOCACAO`).
- Ações: `REGISTRAR_REALOCACAO_DE_DOTACAO` e `ANULAR_REALOCACAO_DE_DOTACAO` (atualização de
  permissões v37, só para quem administra permissões no global).
- **Fora do escopo, nomeado**: a alteração do quadro de detalhamento sem lei (`5.2.2.1.9.01`,
  modalidade e elemento dentro da mesma programação) — outro fato, ainda não representado.

## V35 — o limite percentual de suplementação da LOA (Lei 4.320, art. 7º, I)

`limite-de-suplementacao.ts`. Quando a lei de crédito é SUPLEMENTAR e tem `percentualLimite`, o `executarCredito`
confere, depois do teto em reais e na mesma transação com as fichas travadas:

- **o limite:** `percentualLimite` × Σ `DOTACAO_INICIAL` das fichas do exercício do decreto;
- **o consumido:** a mesma `suplementacaoLiquida` do teto, sobre os decretos da lei, fora as fichas de fonte declarada em
  `FonteForaDoLimiteDeSuplementacao` para o exercício;
- **a recusa:** quando o suplementado agora, fora as fontes excluídas, passa do restante. A mensagem diz o percentual, a
  despesa fixada, o limite, o já suplementado e o restante.

Fonte não declarada conta no limite. Exercício sem dotação inicial é recusado: sem base não há limite.

**A fonte excluída é declaração do ente**, com fundamento (`declararFonteForaDoLimiteDeSuplementacao`, sob
CRIAR_LEI_DE_CREDITO). Para Esperança, o `esperanca-configurar-exercicio.ts` declara as fontes da tabela da STN 2026 cujo
nome diz origem em terceiro (Lei 613/2025, art. 5º, § 2º). A 540, FUNDEB de impostos, continua no limite.

**Pendência nomeada:** o inciso III da Lei 613 submete remanejamento, transposição e transferência ao mesmo percentual,
e `realocacao.ts` ainda não o confere.

Teste: `m03-limite-da-loa.test.ts`:
- acúmulo de dois decretos, e o valor exato do limite passa;
- a fonte excluída, nas duas direções;
- anulação devolve o limite;
- lei sem percentual;
- recusa nomeada.
