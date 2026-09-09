# M02 — CMD, MBA e limitação de empenho

**TR 4.18** (CMD/MBA com base na LOA) · **4.19/4.24** (modelo de decreto) · **4.43** (limitação de
empenho pelo CMD) · **4.44** (liberação de saldos) · art. 8º/9º/13 da LRF.

A LOA diz quanto o ente pode gastar no **ano**. O CMD diz quanto por **mês**, por **fonte** — para
o caixa não secar em março com o orçamento inteiro empenhado. Quando a receita frustra (art. 9º),
o ente **contingencia**: limita o empenho ao cronograma, e o guard do 4.43 dá dentes a isso.

## 1. A aritmética que fecha ao centavo (o coração do t1)

`100.000 / 12 = 8.333,3333…` — e doze parcelas de `8.333,33` somam `99.999,96`, quatro centavos a
menos que a lei. Um cronograma que não fecha com a LOA é um cronograma que o TCE devolve.

`distribuirEmParcelas` trunca **para baixo** (`ROUND_DOWN`, não `toFixed` que arredonda) as `n−1`
primeiras e joga o **resto na última**:

| previsão ÷ n | parcelas | Σ |
|---|---|---|
| 120.000 ÷ 12 | 12 × 10.000,00 | 120.000,00 |
| 100.000 ÷ 12 | 11 × 8.333,33 + **8.333,37** | 100.000,00 |
| 100.000 ÷ 6 | 5 × 16.666,66 + **16.666,70** | 100.000,00 |

⚠️ **Duas armadilhas, ambas capturadas por teste:** (1) `toFixed(2)` arredonda, não trunca —
`16.666,6667 → 16.666,67`, e cinco delas + o resto passariam do total; (2) `toMoney` arredonda
antes do truncamento, então a divisão crua vai **direto** ao truncador. É pura (Decimal, sem I/O),
então o t1 exercita com a conta na mão.

## 2. Planos versionados, append-only

Um decreto de programação é **ato político**: publicado, depois retificado. Sobrescrever a versão
apagaria a história ("qual era a cota de março **quando** o empenho foi feito?"). A vigente é a de
`vigenteDesde` mais recente na data do fato — anatomia do `LimiteContratacao`. Retificar é
**versão nova** (t6). Retirar cota **não** é liberação negativa: é versão nova com valor menor.

## 3. O guard do 4.43 — opt-in, fail-closed, por mês

```
cota vigente(fonte, mês) + Σ liberações − Σ empenhos líquidos(fonte, mês) >= valor
```

- **Opt-in, default OFF** (`EventoLimitacaoEmpenho`). Sem o evento ativo, o guard **retorna na
  primeira linha** e o `empenhar` roda idêntico — é o que preserva os **779** (t2, t10).
- **Fail-closed quando ativo:** fonte sem cota **rejeita** nomeando a ausência (t5). Programar zero
  é uma cota de valor 0, não a ausência.
- **Por mês, e a cota NÃO rola:** fevereiro é independente de janeiro (t3). Realocar exige
  **liberação** (4.44) ou versão nova.
- **Rejeita nomeando os cinco números** (cota, liberado, teto, consumido, disponível, pedido) —
  "estourou" sem os números não diz ao ordenador o que cortar.
- **v2 reduz abaixo do já empenhado?** O plano **grava** (é ato político); o sistema **mostra** o
  estouro no próximo empenho, não o esconde (t6).

### O líquido, herdado de graça

O consumido é `somaLiquidaEstornaveis` — o mesmo motor do `empenhadoLiquidoPorContrato`. Empenho
anulado **devolve** a cota; anulação parcial devolve a parte (t4). **Zero aritmética nova.**

### A corrida (0(c)) — por que o `travarFichas` não basta

Dois empenhos de fichas **diferentes** da **mesma fonte** travam fichas diferentes — nunca se
cruzam, os dois leem o consumido no mesmo estado, os dois passam, a cota estoura. O lock é sobre a
**cota** (`CotaCmd`, posto **3** — logo após a ficha, posto 2): os dois travam a mesma linha,
serializam, exatamente um passa (t7, 5 rodadas). O `ORDEM_DOS_LOCKS` foi renumerado (+1 a partir do
posto 3), preservando a ordem relativa de todos os recursos existentes.

## 4. MBA — o confronto do art. 9º (leitura pura)

`confrontoMba` compara **meta × arrecadado**, por fonte × bimestre, **acumulado** (o art. 9º
dispara "se ao final de um bimestre a realização não comportar as metas" — cumulativo). O
arrecadado vem do **dono** (`arrecadadoPorFonte`, M04, net de estornos), nunca uma segunda soma
(t8: meta 30.000, arrecadado líquido 25.000 após um estorno no meio → diferença −5.000). Zero
escrita.

⚠️ **Sem ciclo de módulo:** `m04/consultas.ts` (onde `arrecadadoPorFonte` vive) não importa m02, e
o confronto (m02) importa dele — a seta aponta em uma direção só, por arquivo.

## 5. O modelo de decreto (4.19/4.24)

`gerarTextoDecreto` é **função pura** com placeholders nomeados e **fail-closed**: um `{placeholder}`
sem dado **falha** em vez de sair cru no papel (t9). O template default sai do código; o ente
cadastra o seu em `TemplateDecreto` (tabela-parâmetro — a anatomia do roteiro), e o gerador o usa
(t9b).

## 6. Passo 0

- **(a)** `previsaoPorFonte` (d62ae98) já dá o total da LOA por fonte — a base do 4.18, zero leitura
  nova.
- **(b)** o guard entra em `empenhar` após os guards de saldo, antes de `guardsDoContrato` (mesma
  anatomia do 4.48/4.49/4.50); o consumido compõe `somaLiquidaEstornaveis`.
- **(c)** a corrida é real e o `travarFichas` não a cobre → lock na cota, posto 3.
- **(d)** opt-in default OFF preserva os 779 — confirmado (t2/t10).
