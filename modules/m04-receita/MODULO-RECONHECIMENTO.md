# M04 — reconhecimento da receita pelo fato gerador

**TR 5.87** (reconhecimento) · **5.88** (o crédito atravessa a virada) · **4.62** · NBC TSP (regime de competência).

Antes deste bloco, a receita só existia quando o **dinheiro entrava** (D caixa × C VPA). O ente
que lançava o IPTU em janeiro e recebia em julho não tinha, de janeiro a julho, **nada** no
balanço — nem o crédito contra o contribuinte, nem a variação patrimonial que o fato gerador já
havia produzido. O patrimônio do município aparecia menor do que era.

## 1. A competência RENASCE aqui — o outro lado de `c398b4f`

`c398b4f` removeu a `LancamentoContabil.competencia` dormente (herdada, divergente, **sem
leitor**) e prometeu, por escrito: *"a competência de verdade nasce na entidade dona, com leitor
no mesmo commit. Coluna sem leitor não entra."*

Este é esse commit, e as três condições estão cumpridas:

| condição | como |
|---|---|
| entidade **dona** | `ReceitaReconhecida`, não o lançamento genérico que não sabe de que fato é |
| **nome próprio** | `dataFatoGerador` — não um `competencia` que cada módulo leria à sua maneira |
| **leitor no mesmo commit** | `saldoAArrecadar` corta por `dataFatoGerador: { lte }` (t1/t8 provam que ela governa) |

A lição do `campoData` (M01) inteira: quem soma diz **por qual data** soma. O reconhecimento soma
pela data do **fato gerador**; a arrecadação continua somando pela data do **dinheiro**. Duas
perguntas, duas datas — em vez de uma data só, dormente, tentando responder às duas.

## 2. Os quatro atos, e a VPA que nasce UMA vez

```
reconhecer  →  D crédito a receber (classe 1) × C VPA (classe 4)   [gera riqueza]
arrecadar   →  D caixa × C crédito a receber                       [PERMUTATIVO]
inscrever   →  D dívida ativa × C crédito a receber                [RECLASSIFICA]
cancelar    →  D VPD × C crédito a receber                         [renúncia/perda]
```

⚠️ **A VPA nasce no reconhecimento e nunca se repete.** Arrecadar, inscrever e cancelar só
**movem ou extinguem** o ativo já reconhecido. O literal do t1 é o guarda dessa regra: reconhecidos
10.000 e arrecadados 6.000, a VPA continua **10.000** — não vira 16.000. Contá-la de novo em
qualquer um dos três seria reconhecer a mesma receita duas vezes, e o resultado do exercício sairia
inflado — exatamente o que o regime de competência existe para evitar.

## 3. Cancelar ≠ estornar — o número que o TCE procura

São **dois atos**, e modelá-los como um só apagaria a renúncia fiscal da história:

- **Estornar** = o crédito nunca deveria ter existido (erro). O fato se **nega**: inverte-se o
  lançamento, a VPA volta atrás. Não houve perda — houve engano.
- **Cancelar** = o crédito existiu e **morreu** (anistia, remissão, prescrição). A VPA de janeiro
  **fica** (foi verdadeira); a perda é uma **VPD** — e é ela que revela *quanto o ente perdoou este
  ano*. É o precedente da `REVERSAO` de provisão (M10): reverter não é estornar.

`estornarReconhecimento` é livre **sem baixa** e **porta fechada com baixa** (desfaz-se pelas
pontas — anula a arrecadação, estorna a inscrição). É o precedente do recebimento de dívida ativa.

## 4. O saldo é DERIVADO — e a anulação "desfaz o vínculo" sem escrever nada

```
saldo a arrecadar = reconhecido − Σ arrecadado (guias VIVAS) − Σ inscrito − Σ cancelado
```

⚠️ **"Guia viva"** é o ponto sutil: um vínculo só conta se a arrecadação dele não é anulação e não
foi anulada. Quando a guia é anulada, o vínculo **não é apagado** — simplesmente **para de contar**.
Zero escrita para desfazer, nada a divergir (disciplina do `packages/estornaveis`). O t6 prova:
anular a arrecadação vinculada **restaura** o saldo, e o estorno que antes batia na porta fechada
passa a ser livre.

## 5. A reclassificação fecha a pendência do bloco 6

`inscreverDividaAtiva` ganhou **um** ponto de bifurcação, por parâmetro:

- **com `reconhecimentoId`** → reclassificação: D dívida ativa × C **crédito a receber** (o crédito
  já foi reconhecido; aqui só muda de lugar, e a VPA **não** se repete — t3);
- **sem** → o caminho de sempre: D dívida ativa × C **VPA** (o ente reconhece agora — t4).

O XOR é fail-closed: `reconhecimentoId` e `contaCreditoAReceberId` vêm juntos ou não vêm.

## 6. Concorrência e locks

`ReceitaReconhecida` entra no **posto 8** do `ORDEM_DOS_LOCKS`, **antes** de `DividaAtiva` (9) — o
caminho natural é reconhecer → inscrever, e a reclassificação decide sobre o saldo do
reconhecimento antes de mexer na dívida ativa. `Σ baixas <= saldo` é soma-decide-grava com lock: o
t7 prova, em 5 rodadas, que duas guias concorrentes de 3.000 contra saldo 4.000 resultam em
**exatamente uma** (sem o lock, o crédito a receber ficaria negativo em 2.000).

## 7. Sigilo fiscal (TR 7.4.2 · CTN art. 198)

`contribuinteRef` é **opaca** (nunca um CPF) e **nunca sai nos datasets do M13** — o
`datasetReceita` é agregado por natureza+fonte e não conhece esta tabela. Publicar "IPTU, 1.240,00,
João da Silva" quebraria o sigilo em nome da transparência, que é o que o 7.4.2 proíbe. O t9 prova
por código-fonte (a string `contribuinteRef` não aparece no M13).

## 8. O 5.88 cumprido POR NATUREZA — sem código novo

O crédito a receber é **classe 1**. A apuração zera **3/4**; o encerramento de controles zera
**5/6**. **Ninguém toca a classe 1** — o crédito reconhecido em dezembro e não arrecadado
**atravessa a virada** e continua sendo um ativo do ente em janeiro, exatamente como manda a
competência. O t5 **prova** isso (roda a apuração de verdade e mostra o crédito intacto), não o
constrói.

## 9. O que ficou nomeado

- **Idempotência da integração tributária (TR 7.6/4.68)** — `referenciaExterna String? @unique` é
  o **gancho**, não a lógica. A coluna nasce nullable e sem leitor (é um espaço reservado, declarado
  como tal — o oposto da competência dormente), e torna a idempotência um `upsert` no dia em que a
  integração em lote chegar.
- **Guia de origens mistas** — uma guia só quita reconhecimentos que compartilhem a mesma conta de
  crédito a receber (o motor do M04 carimba um valor por lançamento, não faz pernas de contas
  distintas). Origens diferentes exigem guias separadas — mesmo princípio da parcial com retenção.
