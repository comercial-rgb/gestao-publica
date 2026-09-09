# M05 — despesa

Reserva → empenho → liquidação → pagamento, e o **saldo orçamentário da ficha**.

**Status: CONCLUÍDO** — blocos 1 e 2. Reserva, empenho, liquidação e pagamento,
com saldo materializado por recálculo e estado sempre derivado.

## Requisitos TR cobertos

- TR **4.41–5.27** (parcial) — reserva, empenho e o controle de saldo da dotação.
- TR **4.51** — empenho sem saldo disponível é **rejeitado** (fail-closed).

## Depende de

- **M01** — `criarPrismaClient()`, `ContaRepositoryPort`, `IdPort`, `LancamentoContabil`.
- **M02** — `FichaOrcamentaria` (e suas colunas de saldo), `Subelemento`.
- `packages/ledger`, `packages/contracts`.

## Invariantes (NUNCA violar)

1. **DINHEIRO = Decimal(18,2).** Zero Float.
2. **APPEND-ONLY.** `ReservaDotacao`, `Empenho` e `MovimentoDotacao` são
   imutáveis — sem `updatedAt`, sem `deletedAt`. Anulação/liberação = registro
   **NOVO** que referencia o original. Um empenho é anulado no máximo uma vez
   (índice único parcial `uq_estorno_empenho_unico`); idem reserva
   (`uq_estorno_reserva_unico`).
3. **SALDO MATERIALIZADO POR RECÁLCULO.** `MovimentoDotacao` é a **fonte da
   verdade**. As 4 colunas de saldo da ficha são **cache**, e só são escritas
   como `coluna = SELECT SUM(MovimentoDotacao...)` dentro da MESMA transação que
   insere o movimento. **PROIBIDO `saldo = saldo ± valor`** — um UPDATE cego
   perde a corrida entre transações concorrentes e o saldo derrapa em silêncio,
   que é como sistema de orçamento estoura dotação sem ninguém ver.
4. **RECONCILIAÇÃO.** `reconciliarFicha(fichaId)` compara cada coluna cache com
   o SUM real e devolve as divergências. **Tem de dar `[]` sempre.** Os testes
   reconciliam depois de **cada** operação de saldo.
5. **FAIL-CLOSED de saldo (TR 4.51).** Reserva/empenho sem disponível suficiente
   = REJEITA, nada grava. A checagem lê o **SUM REAL dentro da transação** —
   nunca a coluna cache, que por definição pode estar suja.
6. **Toda fase gera lançamento balanceado por subsistema** (via
   `validarLancamento`, antes de qualquer I/O).

## Os sinais do MovimentoDotacao

`valor` é **sempre positivo**; quem dá o sinal é o `tipo`. Assim não existe
movimento com valor negativo escondendo uma anulação.

| Tipo | Saldo | Sinal |
| --- | --- | --- |
| `DOTACAO_INICIAL`, `CREDITO_ADICIONAL` | autorizado | + |
| `ANULACAO_CREDITO` | autorizado | − |
| `RESERVA` | reservado | + |
| `RESERVA_LIBERADA` | reservado | − |
| `EMPENHO` | empenhado | + |
| `EMPENHO_ANULADO` | empenhado | − |

`disponivel = autorizado − reservado − empenhado`.

A `DOTACAO_INICIAL` nasce do `valorDotado` **junto com a ficha** (adapter do M02),
na mesma transação — desde a correção da Parte 5-fix. Antes ela era semeada
preguiçosamente, e uma ficha nunca tocada reportava saldo autorizado ZERO.
Unicidade garantida pelo índice parcial `uq_dotacao_inicial_unica`.

**`garantirDotacaoInicial()` é agora um NO-OP DEFENSIVO, FAIL-CLOSED:** ele **já
não cria** nada — apenas confere, e **LANÇA** se a ficha não tiver dotação.
Enquanto criava silenciosamente, ele **mascarava** fichas nascidas por um caminho
errado: a ficha ficava sem dotação, todo relatório mostrava saldo zero, e só na
primeira operação de saldo o buraco era tapado. O erro aparecia no demonstrativo,
nunca no código. Agora estoura na cara de quem tentar mexer nela, com a instrução
de rodar o backfill.

**PENDÊNCIA:** remover a função por completo, depois de confirmar que nenhum
caminho cria ficha fora do adapter do M02. Os testes que precisavam de id fixo
passaram a usar `test/ficha-teste.ts`, que cria a ficha **com** a dotação.

**Empenho vindo de reserva não consome disponível duas vezes:** o valor já está
retido em `reservado`, e o empenho gera `RESERVA_LIBERADA` no mesmo valor. Há
teste provando que o disponível cai só uma vez.

## Decisões conscientes (não são esquecimentos)

- **NÃO existe coluna `status` no Empenho — e isso é de propósito.**
  O spec pedia `status StatusEmpenho` **e** append-only na mesma frase. As duas
  coisas não coexistem: para o status andar (EMPENHADO → PARCIAL_LIQUIDADO → …)
  seria preciso dar UPDATE no empenho, que é exatamente o que o append-only
  proíbe. Um status gravado na criação ficaria **congelado em EMPENHADO para
  sempre** — pior que não ter. O próprio spec diz "máquinas de estado DERIVADAS
  dos valores, não campo editável solto": é o que fizemos.
  `statusDoEmpenho()` (`dominio.ts`, puro) calcula o estado a partir dos SUMs.
  Mesma coisa em `ReservaDotacao`.
- **As ports do M05 são GROSSAS** (`reservar`, `empenhar`) em vez de finas
  (`inserirMovimento`, `atualizarSaldo`). A checagem de saldo e o recálculo do
  cache **têm** de acontecer dentro da mesma transação do INSERT; uma port fina
  obrigaria o serviço a orquestrar transação — e o serviço não pode conhecer
  transação sem furar o hexagonal.
- **`ReservaEmpenho` é tabela de junção**, não FK opcional no `Empenho`. Assim o
  vínculo reserva↔empenho fica explícito e não obriga a mexer no `Empenho`
  depois.

## Arquivos deste módulo

- `prisma/schema/m05-despesa.prisma` — `MovimentoDotacao`, `ReservaDotacao`,
  `ReservaEmpenho`, `Empenho`, `Liquidacao`, `Pagamento`, `ContaBancaria`; enums
  `TipoMovimentoDotacao`, `TipoEmpenho`.
- `prisma/schema/m02-planejamento.prisma` — **aditivo**: as 4 colunas de saldo na
  `FichaOrcamentaria`.
- `prisma/sql/uq_estorno_empenho_unico.sql` e
  `prisma/sql/uq_estorno_liquidacao_pagamento.sql` — índices únicos parciais
  (uma anulação por empenho / reserva / liquidação / pagamento).
- `modules/m05-despesa/dominio.ts` — `calcularSaldos` (a aritmética do saldo,
  **pura**), `statusDoEmpenho`, os 3 roteiros contábeis, Zod. **Sem I/O.**
- `modules/m05-despesa/servico.ts` — bloco 1 (reserva, empenho, reconciliação).
- `modules/m05-despesa/servico-bloco2.ts` — liquidação, pagamento e anulações.
- `modules/m05-despesa/ports.ts`, `adapter-prisma.ts`, `index.ts`.
- `modules/m05-despesa/m05.test.ts` (bloco 1) e `m05b.test.ts` (bloco 2).

## Aditivos feitos em outros módulos (mínimos, não-destrutivos)

1. **M01**: `PartidaParaPersistir.fichaId?` — a partida passa a poder carregar a
   dimensão orçamentária. Opcional: partidas sem ficha continuam válidas. A
   coluna `PartidaContabil.fichaId` já existia (M02); faltava o M01 saber
   **gravá-la**.
2. **M02**: `Empenho.subelementoId` é **opcional**. O `Subelemento` ainda não tem
   seed real (arquivo TCE-PB pendente) — empenho é válido sem ele.

## Bloco 2 — liquidação e pagamento

- **Limites lidos do SUM REAL, dentro da transação:** liquidar não pode
  ultrapassar o empenhado; pagar não pode ultrapassar o liquidado. `liquidado` e
  `pago` saem LÍQUIDOS das anulações (a anulação é um registro NOVO que neutraliza
  o original — nada é subtraído por UPDATE).
- **TR 5.23** — a fonte do pagamento TEM de casar com a fonte da conta bancária.
  Para essa regra existir de verdade foi preciso criar o model `ContaBancaria`
  (`codigo` + `fonteId`): o spec trazia `contaBancaria` **só como string**, e sem
  saber a fonte da conta a regra é **inverificável**. Pagar recurso de uma fonte
  com dinheiro de outra é desvio — é a razão de a TR exigir isso.
- ⚠️ **...E A FONTE DA FICHA — o outro elo, que faltava.** A corrente é
  `pagamento → liquidação → empenho → ficha → FONTE`, e o guard da TR 5.23 cobria só o
  último centímetro dela. Dava para pagar uma despesa da **fonte 500** (impostos) com
  dinheiro da **conta do FUNDEB**: bastava declarar fonte 540 e usar a conta 540, e os
  dois guards existentes **aplaudiam**. Havia um teste que **exigia** esse comportamento
  ("TR 5.23: ACEITA quando a fonte casa com a da conta") — ele empenhava numa ficha da
  fonte 500 e pagava com a conta do FUNDEB.

  **O que isso quebrava:** o `despesaPorFonte` agrupa os PAGAMENTOS por
  `Pagamento.fonteId` e as LIQUIDAÇÕES pela fonte da **ficha**. Divergindo, uma liquidação
  de 1.000 na fonte 500 paga com 100 da 540 produz `obrigações(500) = 1.000` (a dívida
  **nunca baixa**) e `obrigações(540) = −100` (**negativa**). As duas fontes mentem — e o
  superávit financeiro por fonte é justamente o número que **autoriza crédito adicional**
  (TR 4.37, amarrado em `cf765b0`). O **total** fecha, porque os erros se cancelam: é por
  isso que a S2 do Anexo 14 (que compara totais) nunca pegou.

  O guard mora em `guard-fonte.ts` — um arquivo **avulso**, que não importa nada além do
  tipo do client. Não é preciosismo: **o pagamento de RESTOS A PAGAR não passa pelo
  `pagar()`** (o M08 cria o `Pagamento` por conta própria), e o RP é justamente onde a
  troca de fonte é mais tentadora — o exercício virou, a conta mudou. Uma função, **dois**
  chamadores; nunca duas cópias. Mesmo desenho do `m08/guard-exercicio.ts`, que o M05
  importa há blocos: a aresta é fina e não fecha ciclo.
- **SEM ÓRFÃO:** anular liquidação que já tem pagamento vivo é REJEITADO. Anule o
  pagamento primeiro — senão o pagamento ficaria apontando para um fato que "não
  aconteceu".
- **Status DERIVADO em ação:** `statusDoEmpenho()` agora é alimentado pelos SUMs.
  A cadeia EMPENHADO → PARCIAL_LIQUIDADO → LIQUIDADO → PARCIAL_PAGO → PAGO
  acontece **sem um único UPDATE** — e anular a liquidação faz o status **voltar**
  a EMPENHADO sozinho, porque ele é uma função, não um campo. Um `status` gravado
  não faria isso: ficaria mentindo "LIQUIDADO" para sempre.

### Roteiros contábeis (sem conta mágica — os códigos vêm por parâmetro)

| Fase | PATRIMONIAL | ORÇAMENTÁRIO |
| --- | --- | --- |
| Empenho | *(nenhum — a despesa ainda não foi incorrida)* | D crédito disponível / C crédito empenhado |
| Liquidação | D variação diminutiva / C obrigação a pagar | D crédito empenhado / C crédito liquidado |
| Pagamento | D obrigação a pagar / C disponibilidade | D crédito liquidado / C crédito pago |

O empenho **não** gera fato patrimonial: quem gera é a liquidação, quando a
despesa é incorrida e a obrigação com o fornecedor passa a existir.

## Pendências

- `CREDITO_ADICIONAL` / `ANULACAO_CREDITO` existem no enum e na aritmética do
  saldo, mas **não têm caso de uso** — são do M03.
- `ContaBancaria` não tem seed nem caso de uso de cadastro — os testes a criam
  direto. O cadastro é do módulo financeiro/tesouraria (M09).

## Fora de escopo aqui

- **Créditos adicionais** → M03.
- **Ordem cronológica de pagamento** → M06.
- **Retenções** → M15.
- **Licitações/contratos** → M11 (`ReservaDotacao.licitacaoId` é o gancho).

## TR 5.35 — ANULAÇÃO PARCIAL (a lacuna declarada desde o início)

### A parcial é um FATO NOVO, não um estorno — e por isso ganhou COLUNA PRÓPRIA

| Coluna | O que diz |
|---|---|
| `estornoDeId` | **NEGA** o fato: o original **sai** de toda soma líquida. |
| `anulacaoParcialDeId` | **REDUZ** o fato: o original **fica**, valendo menos. |

⚠️ **Gravar a parcial como estorno teria quebrado o sistema inteiro, em silêncio.** Toda
leitura líquida do repositório trata `estornoDeId` como "este fato deixou de existir" —
a fila do art. 141 (M06), o saldo do contrato (M11), o superávit por fonte (M12), o
relatório de restos (M12), o empenhado da ficha (M05). Uma anulação parcial de 1.000
sobre um pagamento de 2.500 gravada como estorno faria **todas** responderem **zero** —
e não 1.500.

### A soma líquida virou `packages/estornaveis` — havia TRÊS cópias

`somaLiquidaEstornaveis` (M08), `pagoLiquido` (M06) e `liquidadoLiquido` (M05) eram três
implementações da mesma soma — o M06 tinha a sua porque `m06 → m08` seria ciclo. A
parcial obrigaria a ensinar o caso novo às três, e a que esquecesse **mentiria em
silêncio**. Agora a soma é **uma**, e mora abaixo de todos.

### O guard é sempre o saldo do nível de BAIXO

`empenho` → o não-liquidado · `liquidação` → o não-pago · `pagamento` → o pago.
A cadeia `pago <= liquidado <= empenhado` (a mesma do 5.103) se quebraria pelo elo do
meio se a ordem fosse outra.

### As duas portas fechadas do pagamento

- **COM RETENÇÃO (M07)**: o lançamento é **composto** — reduzi-lo em parte exigiria
  decidir **de quem** sai o pedaço (do fornecedor ou do consignatário), e a resposta não
  está em lugar nenhum. Barrado no serviço **e** no motor puro (defesa em profundidade).
- **QUE AMORTIZOU DÍVIDA (M10)**: "encolher uma amortização" é um fato que ninguém
  definiu.

Nos dois casos: **anule o pagamento inteiro e refaça-o pelo valor certo** — e a anulação
total segue cascateando (retenção e amortização), como sempre.

### ⚠️ A fila do art. 141 NÃO refletia sozinha

O passo 0 supunha que a parcial apareceria por derivação. **Não aparecia**: o M06 lia o
`valor` **bruto** da liquidação. Sem o ajuste, o art. 141 mandaria pagar o que a
fiscalização **glosou**. Corrigido — a fila agora lê o **líquido**.

## O SUBSISTEMA ORÇAMENTÁRIO NO RAZÃO (a cura do furo de 46dfd5d)

Até este bloco o razão só conhecia **duas** pernas da dotação: o `EMPENHO` (D crédito
disponível / C crédito empenhado) e o estorno dele. A **LOA**, os **créditos adicionais** e
as **reservas** viviam só no `MovimentoDotacao` — nunca tocaram o razão.

Consequência: o **crédito disponível**, conta **credora**, era **debitado** pelo empenho e
**nunca creditado**. Saldo devedor, permanente. O subsistema orçamentário do razão
simplesmente **não refletia o orçamento** — e é exatamente ele que o SICONFI espera povoado.

**O balancete fechava.** Todo lançamento é balanceado, um a um, e o motor do M01 recusa o que
não fecha. Por isso ΣD == ΣC continuava verdadeiro **com metade do orçamento faltando**. Foi
a MSC (M14), ao ser calculada célula a célula à mão, que expôs a conta credora com saldo
devedor.

### O censo (passo 0) — e ele mostrou 4 lacunas, não 2

| tipo | quem cria | lançava? |
|---|---|---|
| `DOTACAO_INICIAL` | M02 (criação da ficha) | ❌ |
| `CREDITO_ADICIONAL` | M03 (`executarCredito`) | ❌ |
| `ANULACAO_CREDITO` | M03 (perna de anulação e estorno) | ❌ |
| `RESERVA` | M05 (`reservarDotacao`) | ❌ |
| `RESERVA_LIBERADA` | M05 (empenho de reserva, liberação) | ❌ |
| `EMPENHO` | M05 (`empenhar`) | ✅ pelo roteiro do chamador |
| `EMPENHO_ANULADO` | M05 (anulação total e parcial) | ✅ (estorno) |

O spec pedia duas curas (dotação e créditos). **A reserva era a terceira** — e sem ela a
A1-orc **não fecharia**: o disponível do razão ignoraria o reservado, enquanto o da ficha o
subtrai.

### `LANCA_PELO_ROTEIRO_ORCAMENTARIO` — Record exaustivo

Um tipo novo de movimento de dotação **não compila** até alguém dizer se ele tem perna no
razão. Sem isso, o valor novo entraria na ficha e sumiria do razão **em silêncio** — que é
*exatamente* como este furo nasceu.

O `EMPENHO` responde `false`, e isso **não é** "não lança": ele **já** lança, pelo roteiro
que o chamador passa. Um roteiro paralelo o lançaria **duas vezes** — a lição da ENTRADA do
almoxarifado, que não tem roteiro próprio porque a liquidação já debitou o estoque.

### A1-orc — a amarração que faltava

`conferirDotacaoContraRazao`: por conta, o **saldo no razão** contra a **Σ dos movimentos de
dotação**. Duas leituras independentes do mesmo orçamento. O lado dos movimentos sai do
`calcularSaldos` — a **mesma** função que a ficha usa. Zero segunda aritmética; só a
confrontação.

É a única leitura que enxerga esta classe de furo, e é sempre assim: o balanceamento pega
lançamento torto; **só a confrontação de duas fontes pega lançamento que não existe**.

### Fail-closed, e o preço dele

Tipo que deve lançar e não tem roteiro → a operação **inteira** cai (t5 prova por SELECT: nem
movimento, nem lançamento). Isso alcança **toda** fixture que cria ficha — por isso o seed do
roteiro mora em `test/roteiro-orcamentario.ts` e é chamado de dentro do `criarFichaDeTeste`.
Uma cópia em cada fixture seriam quarenta lugares para esquecer de um.

### ~~PENDÊNCIA NOMEADA~~ — o encerramento das contas de controle: **CURADO**

Era: o `apurarResultadoDoExercicio` (M08) zera as **VPA/VPD** (classes 3 e 4) contra o
patrimônio líquido, mas **não** zerava as contas de **controle** (5 e 6). Na virada, a dotação
inicial, o crédito disponível e o empenhado atravessavam para o exercício novo, e o
`beginning_balance` da MSC de janeiro trazia o orçamento que já tinha acabado.

**Curado pelo `encerrarControlesOrcamentarios` (M08).** Ele enterra as 5/6 num lançamento de
`natureza = ENCERRAMENTO`, pelo destino que a tabela-parâmetro `ContaNaVirada` dá a cada conta
(`ENCERRA` | `TRANSFERE`), fail-closed. Ver o M08.

E o furo tinha um IRMÃO, que só apareceu quando o segundo exercício existiu: o recorte da MSC
excluía os lançamentos de `ENCERRAMENTO` **de todos os anos, para sempre** — então o
`beginning` de janeiro de E+1 descartava o encerramento de E, e nem a apuração chegava ao ano
novo. Curado no M14 (o `excluirDesde` do M01), com a identidade **M5** para prová-lo.

### A reserva não tem data própria

`ReservaDotacao` só tem `criadoEm` — a data do FATO, para ela, **é** a da criação. Declarado:
quando a reserva ganhar data própria, ela entra no `registrarMovimentoDotacao` e o corte da
MSC passa a segui-la.
