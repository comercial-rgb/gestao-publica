# Varredura das três seções derrubadas — 5.17, 5.18, 5.19

- **Quando:** 2026-09-11, na abertura do ENT05
- **Sobre:** as **184 cláusulas** das três seções que o censo do ENT03c reclassificou
  (5.17 com 113, 5.18 com 25, 5.19 com 46)
- **Método:** as cinco famílias conhecidas foram procuradas por assinatura no texto de cada
  cláusula, e os achados lidos um a um. As decisões vêm **todas de uma vez**, com a
  alternativa recomendada e o custo de decidir depois.

⚠️ **Esta varredura NÃO substitui a do ENT03b** (`varredura-de-modelo-ent04-ent05.md`), que
cobriu 543 cláusulas de duas frentes. Ela **aprofunda** as três seções que viraram o lote, e
confirma ou corrige o que aquela recomendou. Onde as duas falam do mesmo item, esta manda.

---

## O que a varredura por assinatura encontrou

| Família | Cláusulas | Onde |
|---|---:|---|
| F1 — "naquela data" sem eixo temporal | 18 | 5.17.23 .77 .81 .82 .95 .105 · 5.18.2 .3 .6 .9 .11 .16 .18 .19 · 5.19.5 .6 .20 .26 |
| F2 — cardinalidade UM onde o documento pede UM OU MAIS | 6 | 5.17.67 .71 .72 · 5.19.6 .7 .40 |
| F3 — efeito colateral antes de operação guardada | 13 | 5.17.12 .36 .48 .49 .50 .62 .100 .112 · 5.18.1 · 5.19.5 .19 .28 .39 |
| F4 — comparação por instante onde é data civil | 20 | 5.17.14 .31 .32 .38 .75 .78 .85 .87 .88 .89 .94 .97 .104 .112 · 5.18.14 .16 .18 .20 · 5.19.34 .38 |
| F5 — o documento pede CONFIGURÁVEL, o óbvio é CONSTANTE | 3 | 5.17.4 · 5.19.3 .42 |

⚠️ **A assinatura é uma rede, não um veredito.** Ela pesca candidatos; o que segue é o
resultado da leitura. Duas cláusulas que a rede pegou não mudam modelo (5.18.16 e 5.18.18
são relatório sobre um eixo que a decisão 1 já cria), e **três que ela não pegou mudam** —
estão marcadas com *(fora da rede)* e são o motivo de a leitura não poder ser dispensada.

---

## AS DECISÕES — todas de uma vez

### D1 · Posição de estoque — Σ dos movimentos até uma data civil

> **5.18.1** "efetuando a **atualização automática do estoque**" · **5.18.3** "controle de
> **saldo físico**" · **5.18.16** "saldo **anterior ao período**" · **5.18.19** "saldo
> financeiro **mês a mês**"

⚠️ **"Atualização automática do estoque" é a formulação exata do defeito**, e a 5.18.16 a
refuta sozinha: ela pede o saldo **anterior a um período**, que uma coluna não sabe
responder. A 5.18.19 pede mês a mês, que é a mesma pergunta doze vezes.

**Decidido:** sem coluna de saldo. A posição é `Σ(quantidade × sinal)` e
`Σ(valor × sinal)` sobre `MovimentoFisicoDeEstoque` **até uma data civil**, pelo mesmo
molde do saldo da dívida e do razão. O eixo é `dataMovimento` (o fato), nunca `criadoEm`.

**Custo de decidir depois:** migração de dados e reescrita do balanço patrimonial.

### D2 · Preço médio — derivado, e o preço USADO gravado no movimento de saída

> **5.18.11** "cálculo automático do **preço médio**, assim como a sua **atualização a cada
> entrada**, os quais serão **utilizados nas saídas**"

⚠️ **É o pior caso da família F1, porque o preço médio é DINHEIRO e entra no lançamento
contábil da saída.** Uma coluna `precoMedio` sobrescrita a cada entrada torna impossível
responder "por que a saída de março saiu a R$ 4,12?".

**Decidido:** `precoMedioEm(materialId, depositoId, data)` é derivado da mesma janela de
movimentos; e o **valor unitário efetivamente aplicado** é gravado NO MOVIMENTO DE SAÍDA,
porque é um fato. Duas leituras independentes que têm de bater — a mesma amarração que a
dívida e o razão já têm.

### D3 · Inventário guarda o JUÍZO, nunca o saldo

> **5.18.12** "abertura e fechamento de inventários, **bloqueando as movimentações**" ·
> **5.19.20** "informando seu estado e **localização atual (no momento do inventário)**"

⚠️ **O parêntese da 5.19.20 é um eixo temporal escrito por extenso.** "Localização atual
(no momento do inventário)" NÃO é a localização de hoje.

**Decidido:** o inventário guarda a **contagem física** e o **juízo** (estado, localização
observada). A divergência é **derivada** — contado menos Σ dos movimentos até o fechamento —
e nunca congelada. Congelar criaria a segunda verdade, que é o que a conciliação bancária do
ENT03a recusou.

### D4 · Situação, estado e localização do bem — derivados do último movimento até a data

> **5.19.11** estado de conservação · **5.19.12** "situação em que o bem se encontra:
> empréstimo, locação, manutenções" · **5.19.17** "através do registro dos inventários"

**Decidido:** derivados do **último movimento de cada tipo até uma data**, como o papel da
pessoa (M19) é derivado dos movimentos de concessão e encerramento. Nenhuma coluna
`situacaoAtual`, `estadoAtual` ou `localizacaoAtual` no `BemPatrimonial`.

### D5 · Saldo do item de empenho / ordem de compra — Σ das incorporações

> **5.19.6** "controle do saldo dos itens do empenho ou ordem de compra **não permitindo
> incorporar mais de uma vez o mesmo item**" · **5.17.105** "saldo pendente a ser entregue"

⚠️ **A 5.19.6 é F1 e F2 ao mesmo tempo:** "mais de uma vez" implica que a incorporação é
**parcial e repetível**, e um `incorporado Boolean` no item responderia sim/não a uma
pergunta que é de quantidade.

**Decidido:** o saldo do item é `quantidade − Σ(incorporações)` e
`quantidade − Σ(entradas em estoque)`, com corte por data. A guarda é de **soma**, não de
flag: Σ incorporado ≤ quantidade do item. É a mesma aritmética da medição de obra contra o
contrato.

### D6 · Unidades de medida do material — N-N *(fora da rede)*

> **5.17.2** "bem como relacionar **uma ou mais unidades de medida**"

⚠️ A assinatura de F2 não pegou esta porque "uma ou mais" está no fim de uma cláusula
longa sobre descrição. **Ela é literal:** um `unidadeDeMedidaId` no material quebra no
primeiro material comprado em caixa e distribuído em unidade — que é o caso comum do
almoxarifado, e é justamente o que o fator de conversão resolve.

**Decidido:** `Material N—N UnidadeDeMedida`, com **fator de conversão para a unidade de
estoque** e exatamente uma marcada como a de estoque. O saldo é sempre na unidade de
estoque; a entrada e a saída declaram em qual unidade foram feitas.

### D7 · Marcas e elementos de despesa do material — N-N *(fora da rede)*

> **5.17.5** "relacionamento do produto com **marcas pré aprovadas**" · **5.17.9**
> "relacionamento com produtos e **elementos de despesas**, impedindo que determinado
> produto seja comprado com elemento errado"

**Decidido:** as duas são N-N. A 5.17.9 pede uma **guarda**, não um enfeite: comprar com
elemento não relacionado **recusa**, nomeando o elemento e o material.

### D8 · Adesão à intenção de licitação e saldo da ata — N-N e Σ

> **5.17.71** "as **demais secretarias** podem aderir" · **5.17.72** "as secretarias que
> aderirem irão informar o **quantitativo** do item"

**Decidido:** adesão é N-N entre intenção e setor, com quantitativo **por aderente e por
item**. O total do item é Σ das adesões — sem coluna. Confirma o que o ENT03b recomendou.

### D9 · Modelo de edital — um modelo, muitas licitações

> **5.17.67** "criar **modelos de edital padrão** sem ter que criar vários modelos para
> licitações diferentes"

⚠️ A rede pegou esta por "vários", e ela é o **inverso** da família: a cláusula pede que
NÃO se multiplique. Não muda cardinalidade nenhuma — é um requisito de **template com
variáveis**, e o M26 (designer) já é o lugar. **Nada a decidir aqui**, registrado para não
ser reaberto.

### D10 · Transferência entre entidades — operação composta, nunca dois fatos soltos

> **5.19.28** "baixa automática na entidade de origem e incorporação na entidade de
> destino, possibilitando fazer o **estorno da transferência**"

⚠️ **F3.** Se a baixa gravar antes de a incorporação ser viável, o bem some de uma
entidade sem aparecer na outra — e o estorno pede que as duas pernas andem juntas.

**Decidido:** as duas pernas num `operacaoId` só, tudo-ou-nada na mesma transação,
**viabilidade conferida antes de qualquer escrita**. Estornar uma estorna as duas. É o
mesmo molde da alienação, que já gera dois movimentos sob uma operação.

### D11 · Virada mensal da depreciação e seu estorno — idempotência por competência

> **5.19.38** "rotina de **virada mensal**" · **5.19.39** "permitir o **estorno** da virada"

**Decidido:** tudo-ou-nada numa transação, com idempotência pela competência — o líquido
da competência tem de ser zero antes de lançar, como `registrarAtualizacaoMonetaria` da
dívida já faz. Rodar duas vezes o mesmo mês **recusa**, em vez de depreciar em dobro.

### D12 · Estorno em cascata da ordem de compra — direção única

> **5.17.100** "Caso a ordem de compra esteja empenhada, permitir **através do estorno do
> empenho** estornar os itens de uma ordem de compra automaticamente"

⚠️ **A cláusula fixa a direção, e é o oposto do intuitivo.** A cascata vai do **empenho
para a ordem**, não da ordem para o empenho. Uma ordem empenhada **não** pode ser estornada
por si: quem manda é o empenho.

**Decidido:** `estornarOrdemDeCompra` **recusa** se houver empenho vivo, nomeando-o; o
estorno do empenho é que dispara a reversão dos itens. Fail-closed nos dois sentidos.

### D13 · Os configuráveis — parâmetro em tabela, fail-closed

> **5.17.4** campos cadastrais de escolha do usuário · **5.19.3** "outras incorporações
> **configuráveis pela instituição**" · **5.19.42** "avaliações a partir de **fórmulas
> previamente cadastradas, podendo ser editadas**"

⚠️ **A 5.19.42 é a mais perigosa das três, porque fórmula editável é código.**

**Decidido:** a fórmula é uma **expressão aritmética sobre grandezas nomeadas do bem**
(valor bruto, acumulada, idade em meses, vida útil, residual), avaliada por um interpretador
próprio **sem acesso a nada além dessas grandezas** — nunca `eval`, nunca `Function`. Sem
fórmula cadastrada, a avaliação **recusa**. O 5.19.3 usa o cadastro de tipos de
incorporação que já é tabela; o 5.17.4 reusa o M25 (campos adicionais), que já existe.

### D14 · Bloqueio de movimentação — fato com início e fim, não flag *(fora da rede)*

> **5.18.13** "bloqueios por produto, por depósito ou ainda por produto do depósito"

⚠️ Um `bloqueado Boolean` responde "agora" e perde **quem bloqueou, quando e por quê** — e
a 5.18.12 exige saber se a movimentação da noite do fechamento entrou ou não.

**Decidido:** `BloqueioDeEstoque` é um fato com `inicio`, `fim?` e motivo. "Está
bloqueado em D?" é derivado. O inventário aberto bloqueia **pela mesma leitura**, sem
segunda regra.

---

## Resumo — o que muda no modelo, e o custo de adiar

| # | Decisão | Custo se decidida DEPOIS |
|---|---|---|
| D1 | Posição de estoque por Σ até data civil | migração + reescrita do balanço |
| D2 | Preço médio derivado; preço usado no movimento | lançamento contábil irreproduzível |
| D3 | Inventário guarda juízo, não saldo | segunda verdade contra o razão |
| D4 | Situação/estado/localização derivados | a 5.19.20 perde a própria pergunta |
| D5 | Saldo do item por Σ, guarda de soma | incorporação em dobro |
| D6 | Unidades de medida N-N com fator | material em caixa e saída em unidade |
| D7 | Marcas e elementos N-N, com recusa | compra no elemento errado |
| D8 | Adesão N-N com quantitativo por aderente | a 2ª secretaria que aderir |
| D9 | *(nada a decidir — registrado)* | — |
| D10 | Transferência entre entidades composta | bem sumido entre duas entidades |
| D11 | Virada idempotente por competência | depreciação em dobro |
| D12 | Cascata do empenho para a ordem | ordem estornada sob empenho vivo |
| D13 | Fórmula interpretada, sem eval | execução de código do usuário |
| D14 | Bloqueio como fato com início e fim | não se sabe o que entrou no fechamento |

⚠️ **Nenhuma exige contato externo nem credencial.** São todas decisões de MODELO: tomá-las
agora custa esta página; tomá-las depois custa migração sobre fatos já enviados ao tribunal.
