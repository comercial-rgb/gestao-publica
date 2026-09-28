# M08 — restos a pagar + exercício

**Lei 4.320/64, art. 36; MCASP.** Status: **concluído** (blocos 1, 2 e 3).

## Conceitos

- **RP PROCESSADO** — liquidado e **não pago** no encerramento.
- **RP NÃO PROCESSADO** — empenhado e **não liquidado** no encerramento.
- Um empenho pode gerar **as duas** inscrições (a parte liquidada e a que não foi).
- **RP não consome dotação do exercício corrente.** Nenhuma operação de RP cria
  `MovimentoDotacao`.
- **Art. 141 vale para RP:** o pagamento de RP entra na **mesma fila** do M06.

## Invariantes

1. **Decimal(18,2). APPEND-ONLY** em tudo. Estado **derivado**, nunca coluna.
2. **RP NÃO CONSOME DOTAÇÃO.** A dotação do ano que fechou já foi consumida pelo
   empenho — criar `MovimentoDotacao` aqui seria **gastar duas vezes o mesmo
   dinheiro**. Por isso **nenhum roteiro contábil de RP tem perna orçamentária**.
   Testado: toda operação de RP compara a tabela `MovimentoDotacao` inteira
   antes/depois e exige que seja idêntica.
3. **A VERDADE É O SUM.** `valorInscrito` é calculado por SUM **no momento da
   inscrição** — é o retrato do saldo naquele instante, nunca digitado. O saldo
   de RP sai de `valorInscrito − SUM(MovimentoRestosAPagar)`.
4. **FAIL-CLOSED** em todo limite, lido dentro da transação.
5. **"É liquidação de RP" é DERIVADO** — criada depois do encerramento, num
   empenho com inscrição NP. Nunca uma flag.

## As DUAS medidas de uma inscrição NP (e por que são diferentes)

Isto é o ponto mais fácil de errar:

- **`saldoParaLiquidar`** = `inscrito − cancelamentos − liquidações pós-inscrição`
  → *quanto ainda pode virar despesa.* **Não desconta pagamentos**: um RPNP só é
  pago depois de liquidado, e a liquidação já saiu daqui. Descontar os dois seria
  contar a mesma baixa **duas vezes**.
- **`saldoDaInscricao`** = `inscrito − SUM(movimentos)` (pagamentos + cancelamentos)
  → *o razão contábil: quanto da obrigação ainda existe.*

**Liquidar um RPNP não extingue a obrigação — só a qualifica para pagamento.**

## Encerramento (bloco 2)

`encerrarExercicioComRestos(ano)`: **tudo numa transação**. Ou o exercício encerra
**com** todas as inscrições, ou não encerra. Um encerramento que grava metade das
inscrições seria pior que um que não grava nenhuma — o TCE receberia um retrato
inventado.

```
PROCESSADO     = liquidado − pago
NAO_PROCESSADO = empenhado − liquidado
```
Só entra o que for `> 0`. Empenho quitado não inscreve nada. Empenho anulado,
tampouco.

## Guards (blocos 1 e 3b)

| Guard | Rejeita | Direciona para |
| --- | --- | --- |
| `exigirExercicioAberto` | criar ficha / reservar / empenhar / crédito em exercício **inexistente ou encerrado** | abrir o exercício; ou RP |
| `exigirLiquidacaoCorrente` | `liquidar()` do M05 em empenho de exercício **encerrado** | `liquidarRestosAPagar()` |
| `exigirPagamentoCorrente` | `pagar()` do M05 em liquidação de exercício **encerrado** | `pagarRestosAPagar()` |
| (em `pagarRestosAPagar`) | liquidação de exercício **aberto** | `pagar()` do M05 |

O erro típico aqui **não é má-fé — é alguém usando a função errada**. Por isso as
mensagens dizem qual é a certa.

**Exercício inexistente também é erro**, e o sistema **não o cria na hora**: se
criasse, um erro de digitação (`2062` em vez de `2026`) viraria um exercício novo
em silêncio, com orçamento próprio e sem lei por trás.

## A fila do art. 141 ATRAVESSA exercícios

O teste que mais vale aqui: um **RP de 2026** e uma **liquidação corrente de
2027**, na mesma fonte e categoria. O RP é o mais antigo, logo é a **cabeça da
fila** — e pagar a liquidação corrente **sem justificativa é rejeitado**.

Se a query da fila do M06 filtrasse por exercício em algum lugar, o RP antigo
sumiria dela e a **preterição passaria batida**. Ela não filtra, e o teste prova.

## Direção das dependências

```
M02 ─┐
M03 ─┼─> guard-exercicio.ts   (só importa o tipo Tx)
M05 ─┘   guard-restos.ts

M08 (restos.ts) ──> M05 (models), M06 (ordem cronológica)
```

Os guards moram em arquivos **isolados**, que importam apenas o tipo `Tx`. É o que
permite o M05 consumi-los **sem fechar o ciclo** `M05 → M08 → M05` — porque o
`restos.ts` importa o M05 pesado.

## Decisões conscientes

- **Sem FK das demais tabelas para `Exercicio`.** O ano já vive como
  `exercicio Int` / `ano Int` em 6 tabelas. Convertê-los em FK `NOT NULL` seria
  migração destrutiva sem ganho — `ano` já é a chave natural, e é por ela que os
  guards resolvem.
- **"1 encerramento por exercício" é `@unique` no schema, não índice parcial em
  `prisma/sql/`.** Aquela pasta existe para o que o Prisma **não expressa**
  (índices com `WHERE`). Aqui não há `WHERE`.
- **As contas de RP vêm por PARÂMETRO** (roteiro contábil), como em todo o
  projeto. Não existe seed oficial de PCASP — **nada foi inventado**.
  - liquidação de RP: `D variação diminutiva / C RP processados` (patrimonial)
  - pagamento de RP: `D RP processados / C disponibilidade` (patrimonial)
  - cancelamento: `D RP / C variação AUMENTATIVA` — a obrigação morre **sem saída
    de caixa**, e o ente fica com um ganho. É o que distingue cancelar de pagar.

## De onde o parâmetro vem, desde a V15 — `RoteiroRestosAPagar`

Até a V15 o parâmetro vinha **de testes**: nenhuma superfície alcançava as operações porque
não havia tabela de configuração. `RoteiroRestosAPagar` (neste arquivo de schema) é ela, com
cadastro em `/contabilidade/roteiros-de-restos-a-pagar`, versionado e com motivo registrado.

**O levantamento reduziu a unidade duas vezes**, e as duas reduções são o desenho:

1. **Três eventos pedem contas, não cinco.** `anularPagamentoRestosAPagar` e
   `anularCancelamentoRestosAPagar` não têm parâmetro `roteiro`: leem o lançamento original e
   **invertem** as pernas (`gerarEstorno` do M01), inclusive as de retenção, que levam bruto e
   líquido diferentes. Configurar conta de estorno criaria a possibilidade de um estorno que não
   fecha com o que estornou — por isso **não há evento de estorno no enum**.
2. **O passivo do pagamento não é configuração: ele se RASTREIA.** `encerrarExercicioComRestos`
   **não gera lançamento** — não há reclassificação do passivo para contas de "Restos a Pagar".
   Logo a obrigação a baixar é a que a liquidação de origem **creditou**: a do exercício de
   origem num resto PROCESSADO, a do exercício seguinte num que era NÃO PROCESSADO. São dois
   caminhos com passivos diferentes, e a diferença está no dado.
   `passivoDaLiquidacaoDeOrigem` (em `servico-roteiro.ts`) o resolve pelo `liquidacaoId` que o
   próprio pagamento nomeia, confere que a liquidação é **do mesmo empenho** da inscrição, e
   **recusa nomeando todas** quando há mais de uma perna de passivo no mesmo lançamento — em vez
   de escolher a primeira, que seria decidir por acidente de consulta.

A **conta de saída** também não entra no cadastro: é a conta contábil da conta bancária escolhida
no ato (`ContaBancaria.contaContabil`). Guardá-la seria um campo que a operação sobrescreve.

O evento do cancelamento é **o par (operação, tipo)**: cancelar um resto processado extingue um
passivo que existe; cancelar um não processado desfaz um compromisso que nunca virou passivo.

⚠️ **O que NÃO se decidiu:** se o cancelamento libera a DDR comprometida, e para onde. É pergunta
do ente com fundamento do tribunal. O par de controle do cancelamento é **opcional**, sem padrão;
ausente, o cancelamento não move controle — o comportamento desde o ENT03.

⚠️ **As quatro contas de DDR deixaram de ser literais fixos no caminho de produção.** Conferidas
contra o plano do exercício, `8.2.1.1.2.01.00`, `8.2.1.1.3.01.00` e `8.2.1.1.4.01.00` **são**
folhas analíticas oficiais — não eram invenção. Mas elas têm **irmãs oficiais**
(`8.2.1.1.2.02.00` é "COMPROMETIDA POR EMPENHO - EM LIQUIDAÇÃO"), e escolher entre irmãs oficiais
é **roteiro, não norma**. Os três construtores passaram a aceitar o par por parâmetro; o literal
permanece como **padrão apenas para os treze arquivos de teste que já existiam**, e o caminho de
produção (`lib/portas/restos-a-pagar.ts`) sempre passa o configurado.

## Anulação de pagamento de RP (fix)

`anularPagamentoRestosAPagar(pagamentoId, motivo)`.

**O bug que isto fechou:** anular pelo M05 um `Pagamento` que era de RP criava o
`Pagamento` de estorno mas deixava o `MovimentoRestosAPagar(PAGAMENTO)` **órfão**.
A inscrição continuava baixada e o sistema achava que tinha pago algo que foi
desfeito — **saldo de RP errado PARA MENOS**, dinheiro sumindo do resto a pagar
sem ter saído do caixa.

Agora o `anularPagamento()` do M05 **rejeita** pagamento de RP (guard
`exigirAnulacaoDePagamentoCorrente`) e direciona para cá. A operação faz três
coisas **na mesma transação**:

1. `Pagamento` NOVO com `estornoDeId` (append-only — o original é intocado);
2. `LancamentoContabil` de estorno, pernas invertidas pelo `gerarEstorno` do M01;
3. `MovimentoRestosAPagar(ESTORNO_PAGAMENTO)` — **o saldo volta pelo SUM**.

## Anulação de cancelamento de RP (fix da assimetria irmã)

`anularCancelamentoRestosAPagar(movimentoId, motivo)`.

**O bug:** o cancelamento **não tinha volta**. Um cancelamento por engano era
**irreversível** — a obrigação com o credor ficava extinta **no sistema** sem ter
sido extinta **na vida**. O credor continuava com direito a receber, e o sistema
não tinha mais como pagá-lo: o saldo estava zerado.

O lançamento de estorno **reverte a variação AUMENTATIVA** do cancelamento: o
ganho patrimonial deixa de existir, porque a obrigação voltou.

## ⚠️ OS QUATRO TIPOS NÃO TÊM O MESMO SINAL

| Tipo | Efeito no saldo |
| --- | --- |
| `PAGAMENTO` | **reduz** (a obrigação foi honrada) |
| `CANCELAMENTO` | **reduz** (a obrigação deixou de existir) |
| `ESTORNO_PAGAMENTO` | **devolve** (o pagamento foi desfeito) |
| `ESTORNO_CANCELAMENTO` | **devolve** (a obrigação voltou a existir) |

**`SINAL_MOVIMENTO_RP` (`dominio.ts`) é a fonte única do sinal.** Qualquer soma de
movimentos que **não o consulte está errada** — e é aí que o bug se esconde, duas
vezes seguidas:

- **345af7d:** dois pontos usavam `SUM(*)` cru e o estorno de pagamento passou a
  **reduzir** o saldo em vez de devolvê-lo.
- **este fix:** dois pontos usavam `cancelado` **bruto** (`liquidarRestosAPagar` e
  o ramo NP de `cancelarRestosAPagar`) — estornar um cancelamento **não devolveria
  saldo para liquidar**.

Por isso **toda** soma passa agora por `totaisDaInscricao()`, que lê os quatro
totais de uma vez e devolve tudo com o sinal certo:

```
pagoLiquido      = PAGAMENTO    − ESTORNO_PAGAMENTO
canceladoLiquido = CANCELAMENTO − ESTORNO_CANCELAMENTO
baixaLiquida     = pagoLiquido + canceladoLiquido
saldo            = valorInscrito − baixaLiquida
```

**Se você acrescentar um tipo, acrescente ao `SINAL_MOVIMENTO_RP` PRIMEIRO** e
deixe o TypeScript apontar o que quebrou.

### Devolução dupla

`uq_estorno_mov_rp_unico` é `ON (estornoDeId) WHERE estornoDeId IS NOT NULL` — ele
cobre **qualquer** tipo de estorno, não só o de pagamento. Um `uq_estorno_
cancelamento_unico` seria um segundo índice único **na mesma coluna**, redundante.
Provado com `INSERT` direto, driblando o serviço.

## A VIRADA — o encerramento das contas de controle (classes 5 e 6)

`apurarResultadoDoExercicio` zera as classes **3 e 4** contra o PL. Ele **não** toca as **5 e
6** — e essa era a pendência de eada7b5: a dotação inicial, o crédito disponível e o empenhado
**acumulavam entre exercícios**, e o `beginning_balance` da MSC de janeiro trazia o orçamento
que já tinha acabado. `encerrarControlesOrcamentarios` as enterra.

### A tabela-parâmetro `ContaNaVirada` — e por que NÃO é um `Record`

O Record exaustivo é a ferramenta certa quando o conjunto é **fechado** e o compilador pode
cobrar (o `TipoMovimentoDotacao`). **O plano de contas não é fechado**: ele é do ENTE, entra por
`INSERT` e cresce sem recompilar nada. Um Record de códigos de conta seria uma lista que
envelhece em silêncio — a conta 6 nova do ente cairia num `undefined` e o encerramento a
**pularia**.

Então o fail-closed é em tempo de **execução**: conta de controle **com saldo** e **sem
destino** derruba a operação **inteira**, nomeando a conta e o saldo. Dois destinos:

- **`ENCERRA`** — o saldo morre em 31/12 (CF art. 165, a anualidade; art. 167, II, o crédito
  não empenhado **caduca**).
- **`TRANSFERE`** — o saldo atravessa, e **não há nada a lançar**: ele já está lá. O caso
  canônico é o controle de **restos a pagar** (5.3/6.3).

### O lançamento FECHA SOZINHO — e daí sai uma rede de graça

A apuração precisa de um *plug* (o Resultados Acumulados) porque as classes 3 e 4 **não se
espelham**: a sobra entre VPA e VPD é o resultado, e ele tem de ir para algum lugar.

As classes 5 e 6 **se espelham por construção** — a 5 diz *"de onde vem"* e a 6 diz *"em que
estado está"*, e todo roteiro só move o dinheiro de um estado a outro. Logo Σ(saldos das 5) ==
Σ(saldos das 6), e o lançamento que zera as duas pontas **fecha em si mesmo**. A contrapartida
de cada conta 6 **é** a conta 5 que a lastreia. Não há par a hardcodar porque não há par a
escolher: o par é o subsistema inteiro.

**A rede de graça:** classificar **uma** perna de um espelho como `TRANSFERE` e a outra como
`ENCERRA` desequilibra o lançamento, e o motor do M01 (ΣD == ΣC por subsistema) o **recusa**.
Uma conta de controle só transfere **em par**. (Testado: t3b.)

### A conferência PÓS-EVENTO, e por que o motor NÃO a substitui

É a objeção óbvia, e ela está **errada**: *"pular uma conta não desequilibraria o lançamento?"*
Pular **uma**, sim — o motor pega. Pular um **espelho inteiro** (as duas contas de receita, que
se lastreiam) deixa o lançamento **perfeitamente balanceado**, e o motor passa sem piscar. E é
exatamente esse o erro que alguém escreve: *"aqui eu trato o controle da despesa; a receita é
outro assunto."*

**Provado por mutação** (rodada de verdade, no ciclo do t1): com um
`&& !s.codigo.startsWith("6.2.1")` no laço, o `validarLancamento` **aceitou** o lançamento
mutilado — e quem parou foi a conferência de completude, nomeando as duas contas e os saldos.
Nenhuma identidade da MSC pegaria: a M1, a M2 e a M4 amarram o **quanto**, nunca o **se tudo**.
A rede mora no **escritor**, dentro da transação. **Não remover.**

### Ordem em relação à apuração: NENHUMA

Conjuntos de contas **disjuntos** (3/4 + PL × 5/6), conferências disjuntas: os dois
**comutam** (testado: t4c). Exigir ordem seria inventar um acoplamento que a álgebra não tem —
e o preço apareceria no dia em que alguém precisasse estornar só a apuração. O que se exige é o
mesmo que a apuração exige: o **exercício encerrado** (o fato), nunca uma flag.

### ⚠️ A DÚVIDA CONCEITUAL, declarada: `6.2.2.1.3` e `6.2.2.1.3.03`

O saldo dessas duas contas em 31/12 **é**, por construção dos roteiros, o **RPNP**
(empenhado − liquidado) e o **RPP** (liquidado − pago). O MCASP ortodoxo as **transferiria**
para o controle de RP (6.3.x). Aqui elas **ENCERRAM**, por dois motivos que valem mais que a
ortodoxia:

1. **Nada em E+1 volta a debitá-las.** O pagamento de RP é `D 2.1.3.1.1 / C caixa` — classes 2
   e 1, nunca as 5/6. Transferi-las criaria um saldo de controle que **cresce para sempre e
   nunca é consumido**: uma mentira permanente no razão.
2. **O RP tem razão próprio** (`MovimentoRestosAPagar`) — ele não fica sem controle.

**Quando a inscrição de RP ganhar perna no razão** (`D 6.2.2.1.3 / C 6.3.1.1`), essas contas
chegarão **zeradas** ao encerramento e a classificação **segue valendo**: encerrar zero é não
lançar nada. A tabela não muda.

## ⚠️ O ESTORNO É POR PERNA — o caixa recebe de volta o LÍQUIDO, nunca o bruto

Esta seção existe porque a armadilha é **reintroduzível**, e reintroduzida ela fica
invisível. Dois estornos deste módulo já fizeram exatamente isso.

### O fato

Pagar 1.000,00 retendo 100,00 é **um** lançamento com pernas de valores diferentes:

| Conta | Tipo | Subsistema | Valor |
|---|---|---|---|
| obrigação a pagar | DÉBITO | PATRIMONIAL | 1.000,00 |
| disponibilidade (caixa/bancos) | CRÉDITO | PATRIMONIAL | **900,00** |
| consignação a pagar | CRÉDITO | PATRIMONIAL | 100,00 |
| crédito liquidado | DÉBITO | ORÇAMENTÁRIO | 1.000,00 |
| crédito pago | CRÉDITO | ORÇAMENTÁRIO | 1.000,00 |

Do banco saíram **900,00**. Os 100,00 nunca saíram: mudaram de dono dentro do caixa.

### O erro, e por que ele é invisível

O estorno tem de inverter **cada perna pelo valor dela**: o caixa volta a receber 900,00
e a consignação morre por 100,00. Um gerador de estorno que recarimbe um valor ÚNICO por
cima de todas as pernas devolve **1.000,00** ao caixa.

E aí vem a parte que engana:

> **O lançamento continua fechando.** Se o estorno usa 1.000,00 em todas as pernas, ΣD
> continua igual a ΣC — dentro de cada subsistema, inclusive. O balancete fecha. A
> amarração razão × razão fecha. **Os dois lados estão errados na mesma medida**, e é
> exatamente por isso que nenhuma conferência de balanceamento detecta o erro.

O que sobra é 100,00 de disponibilidade que nunca existiu, e uma dívida com o
consignatário que continua no passivo sem lastro em caixa. Descobre-se na conciliação
bancária — meses depois, com o extrato do banco na mão.

### A regra

- Quem gera o estorno produz **o valor de cada perna**, lido do lançamento original.
- Quem persiste **não recarimba** um valor por cima. Se a assinatura da persistência
  aceita um `valor` único, ela está errada para lançamentos compostos.
- Nenhum teste de balanceamento cobre isto. A rede é comparar **perna a perna** contra o
  esperado escrito **antes** de rodar — ver `m08-anulacao-rp.test.ts` ("paga RP 1000
  retendo 100 → o estorno devolve 900 ao caixa, NÃO 1000") e
  `m05-despesa/m05-dossie.test.ts`.

Vale para todo estorno de pagamento com retenção: o do M05 e o do M08 (restos a pagar).

## Pendências

- **A INSCRIÇÃO de RP não gera lançamento contábil.** Ela grava só a linha em
  `InscricaoRestosAPagar` — o RP tem razão próprio, por desenho. Consequência para o
  M14: a IC **AI** (ano de inscrição) só existe nos lançamentos de **movimento** de RP
  (pagamento, liquidação, cancelamento), nunca no `beginning_balance` do RP. É a
  verdade que o sistema tem; um roteiro de inscrição a estenderia.
- **Não há relatório de RP** (inscritos, pagos, cancelados, a pagar por exercício).
  É o que o TCE pede — provavelmente M12.
- **Prescrição de RP** (o prazo em que o RP não processado caduca) não está
  implementada.

---

## 7.4 — A DDR atravessa a virada (exceção registrada)

`roteiroLiquidacaoRestos` e `roteiroPagamentoRestos` ganharam pernas de controle:

```
liquidação de RPNP   D 8.2.1.1.2.01 / C 8.2.1.1.3.01
pagamento de RP      D 8.2.1.1.3.01 / C 8.2.1.1.4.01
```

### Por que a DDR não morre em 31/12

O orçamento é **anual**: o crédito não empenhado caduca (CF art. 167, II), e
`encerrarControlesOrcamentarios` o enterra. **A DDR não é crédito, é dinheiro** — e o
dinheiro de um resto a pagar não caduca junto com o orçamento dele: continua
comprometido com aquele credor, naquela fonte, até sair.

Isso já era verdade no código, e por construção:

```ts
// encerramento-controles.ts:177
saldosDeControle(tx, { classes: ["5", "6"], ate: corte, campoData: "dataTransacao" })
```

A varredura **nunca vê a classe 8**. O `ContaNaVirada` (fail-closed, que derruba conta
de controle sem destino classificado) só é cobrado sobre 5 e 6. A comprometida nasce no
exercício N e é consumida no N+1 pelo pagamento do RP. Se fosse encerrada junto, o
dinheiro reapareceria como disponível em 01/01 e o ente poderia empenhá-lo de novo —
enquanto ainda deve o resto a pagar do ano anterior.

### ⚠️ A exceção ao intocável, e por que ela foi aceita

A 7.4 declarou `dominio.ts` intocável. Estas duas funções foram tocadas **assim mesmo**,
por autorização explícita e **só elas**. A alternativa era um `roteiroPagamentoRestos`
próprio no M01 — e aí o mesmo ato teria **dois donos de roteiro**, que é exatamente o
que a 7.2 consertou.

**"Um dono por roteiro" venceu "intocável de sessão".** Nenhuma outra linha do arquivo
mudou.

---

## A virada das contas de controle, alcançável (V20)

`encerrarControlesOrcamentarios` estava completo desde a V15 e era **inalcançável**. A causa foi
medida antes de construir: `contaNaVirada.create|upsert|createMany` aparecia em quatro lugares do
repositório, e **todos eram arquivos de teste**. A tabela-parâmetro de que o serviço depende era
populada por fixture e por mais ninguém — logo, em instalação real, ela ficava vazia para sempre e a
virada recusava com razão ("conta de controle sem destino na virada") e sem caminho para resolver.

O preço disso não tem detector adiante: a dotação inicial e o crédito disponível de um exercício
**atravessam** para o seguinte. O `beginning_balance` da MSC de janeiro de E+1 traz a dotação de E, e
o segundo ano do sistema publica à União um orçamento que é a soma de dois.

`classificacao-da-virada.ts` fecha isso com três peças:

| Peça | O que é, e a decisão que ela carrega |
|---|---|
| `destinoSugerido(codigo)` | puro. Sugere `TRANSFERE` para os ramos `5.3` e `6.3` (inscrição e execução de restos a pagar) e `ENCERRA` para o resto, com a **razão em português** que a tela mostra ao lado do campo. ⚠️ Ela **sugere e não decide**: o campo nasce preenchido, a justificativa nasce vazia e obrigatória. Uma sugestão aplicada em silêncio seria norma da STN inventada dentro de um `if` |
| `contasDaVirada(tx, {ano})` | a lista **curta**: só as contas das classes 5 e 6 com saldo no corte. O plano tem 7.864 contas, e um `select` com todas é o formulário bonito e inútil que a regra de interface proíbe. Traz a soma das duas pernas, para o operador ver **antes do clique** se o lançamento vai fechar |
| `classificarContaNaVirada` | o ato, com ação própria `PARAMETRIZAR_VIRADA_DOS_CONTROLES`. Recusa classe fora de 5/6 dizendo onde cada classe é tratada, recusa sintética **listando a analítica sob ela**, e reclassificar troca destino e justificativa — nada mais |

### Por que a ação é própria, e não um ramo do encerramento

Dizer que a dotação **caduca** (CF art. 167, II) é ato normativo do ente. Enterrar o orçamento é ato
de execução, feito uma vez por ano. Fundir as duas daria a quem executa o poder de reescrever a régua
pela qual o próprio encerramento dele é medido — a mesma segregação que separa
`PARAMETRIZAR_ROTEIRO_ORCAMENTARIO` de `EMPENHAR`.

### A perna sai do SINAL, e a duplicação é conferida

A perna que zera uma conta vem do sinal do saldo, nunca de uma tabela de "que lado essa conta costuma
ter": credora com saldo positivo morre com débito, credora com saldo **negativo** morre com crédito.
E isso não é teórico — o banco de apresentação tem `6.2.1.1.0.00.00`, credora, com **-80.000,00**.

`pernaQueZera` duplica a derivação que o serviço faz, e a duplicação só é aceitável porque o teste
`t7` afirma que, para cada conta, a perna que a tela mostra é a **mesma** que o encerramento grava —
conferida contra as `PartidaContabil` gravadas, não contra o retorno da função. Mostrar uma perna na
tela e gravar outra é pior do que não mostrar nada.

### `ContaNaVirada` entrou no censo do papel de runtime

Até a V20 os únicos escritores desta tabela eram testes, que rodam como **dono**. A tela é a primeira
coisa que a escreve pelo papel da aplicação, e sem a entrada em `ESCRITA_MUTAVEL_DO_RUNTIME` ela
falharia com "permission denied" no município, com a suíte verde na máquina de quem escreveu. O grant
é `update: ["destino", "justificativa"]` — **`contaId` fica fora**, porque apontar a classificação
para outra conta faria a justificativa escrita para a dotação passar a explicar o destino do controle
de restos a pagar.

### O que o percurso ensinou, e que nenhum teste de módulo pegaria

**Um formulário não pode desaparecer com o próprio sucesso** — e o percurso ensinou isso duas vezes,
no mesmo ato. O estorno vivia dentro da linha da tabela: estornar re-renderizava a linha como
"Estornado", o formulário saía da tela e levava a mensagem de sucesso com ele. Movido para fora, o
defeito voltou um nível acima: a página só o montava quando havia encerramento **vigente**, e
estornar o último o removia de novo. As duas vezes o percurso leu `silencio` com o estorno **gravado**
e o saldo já de volta — e silêncio é indistinguível de "nada aconteceu".

### O que falta, nomeado

- **`DESFAZER-ENCERRAMENTO-INEXISTENTE`** — desfazer o encerramento do exercício e a inscrição dos
  restos não tem serviço nem tela. O percurso afirma o oposto: encerrar de novo é recusado nomeando.
- **`ESTORNO-DA-APURACAO-SEM-BORDA`** — `estornarApuracao` (classes 3 e 4) existe e é censado, e pede
  o id da operação: falta a listagem de apurações que o formulário precisaria.
- **`INSCRICAO-DE-RP-SEM-PERNA-NO-RAZAO`** — a inscrição grava `InscricaoRestosAPagar` e não lança nas
  contas `5.3`/`6.3`. Por isso o caso `TRANSFERE` não tem saldo real em nenhum banco deste
  repositório, e o teste o prova pela aritmética (classificar uma perna do espelho como TRANSFERE faz
  a soma deixar de fechar) em vez de por um saldo que não existe.
