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
