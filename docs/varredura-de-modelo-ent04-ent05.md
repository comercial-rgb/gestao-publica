# Varredura de modelo — ENT04 (pessoal) e ENT05 (suprimentos, patrimônio, frota)

- **Quando:** 2026-09-11, no fechamento do ENT03b
- **Sobre:** as 543 cláusulas das duas frentes (280 do ENT04, 263 do ENT05)
- **Para quê:** achar, ANTES de construir, as famílias de defeito de modelo que os últimos
  três lotes revelaram — e trazer **todas as decisões de uma vez**, com a alternativa
  recomendada de cada.

⚠️ **Nada aqui foi implementado.** Este documento é a mesa posta: cada item tem a cláusula que
o revela, o defeito que ele produziria, e a alternativa recomendada. Construir por cima de um
modelo errado custa o dobro — e o segundo pagamento é feito com migração de dados.

---

## As quatro famílias, e de onde elas vieram

| Família | O caso que a revelou |
|---|---|
| **"naquela data" sem eixo temporal** | a `saldosDaFicha` do ENT03a respondia "agora" e o documento perguntava "naquela data". Virou o ADR da competência em `MovimentoDotacao` |
| **cardinalidade UM onde o documento pede UM OU MAIS** | a 5.10.2.6 — conta bancária com uma fonte só. Virou o ADR da conta multifonte |
| **efeito colateral durável antes de operação guardada** | `porNaFila` gravava o anexo antes da guarda de unicidade; o empenho ficava impossível de assinar para sempre. A mesma forma estava em `gerarBordero` |
| **comparação de data por instante onde é data civil** | o OFX, e depois 35 arquivos. Fechada no ENT03b |

---

## FAMÍLIA 1 — "naquela data" sem eixo temporal no modelo

### 1.1 · Posição de estoque do almoxarifado — **RECOMENDADO: eixo de data no movimento**

> **5.18.1** — "gerenciamento de todas as movimentações de estoque, desde Entradas, Saídas e
> Transferências de materiais, efetuando a atualização automática do estoque"
> **5.18.12** — "abertura e fechamento de **inventários**, bloqueando as movimentações"
> **5.18.14** — "consulta rápida dos dados referentes ao **vencimento do estoque**"

⚠️ **"Atualização automática do estoque" é a formulação exata do defeito.** Ela descreve uma
COLUNA de saldo que se atualiza — e uma coluna de saldo responde "agora" e só "agora". O
inventário da 5.18.12 pergunta **"qual era a posição no dia do fechamento"**, e o balanço
patrimonial pergunta "em 31/12". Nenhuma das duas se responde por uma coluna.

O `MovimentoAlmoxarifado` já existe (M10) e já é append-only. O que falta conferir é se ele
tem **data do FATO** distinta do `criadoEm` — é exatamente a lição do `campoData` do M09.

**Alternativa recomendada:** a posição é Σ dos movimentos **até uma data civil**, como o saldo
da conta bancária e o da dívida. O inventário fechado guarda o **JUÍZO** (a contagem física e
a divergência apurada), nunca o saldo — congelar o valor criaria a segunda verdade, e é
exatamente o que a conciliação bancária do ENT03a recusou.

**Alternativa descartada:** coluna `saldoAtual` com trigger. Ela é mais rápida de escrever e
impossível de auditar: no dia em que divergir da soma, não há como saber qual das duas está
certa.

### 1.2 · Preço médio do material — **RECOMENDADO: derivado, com a fórmula registrada**

> **5.18.11** — "cálculo automático do **preço médio** dos materiais, assim como a sua
> **atualização a cada entrada**, os quais serão utilizados nas saídas"

⚠️ **Este é o pior caso da família, e por um motivo que o de estoque não tem: o preço médio é
DINHEIRO, e ele entra no lançamento contábil da saída.** Uma coluna `precoMedio` atualizada a
cada entrada torna impossível responder "por que a saída de março saiu a R$ 4,12?" — a coluna
já foi sobrescrita por abril.

**Alternativa recomendada:** o preço médio é **derivado** da mesma janela de movimentos, e o
valor **efetivamente usado** na saída é gravado NO MOVIMENTO DE SAÍDA (é um fato: foi por
aquele preço que se lançou). Duas leituras independentes que têm de bater — a mesma amarração
que a dívida e o razão já têm.

### 1.3 · Margem consignável — **RECOMENDADO: derivada por competência**

> **5.12.83** — "calcular o valor **disponível** da margem consignável, descontando os
> empréstimos já existentes e permitindo configurar quais outras verbas devem deduzir"

⚠️ **"Disponível" quando?** A margem de um servidor muda a cada folha, e a pergunta que o
banco consignatário faz é sobre uma competência específica. Uma coluna `margemDisponivel`
responderia sempre a última folha calculada — e autorizaria um empréstimo contra uma margem
que a folha seguinte já não sustenta.

**Alternativa recomendada:** `margemConsignavel(servidorId, competencia)` é função da folha
daquela competência menos os consignados vigentes NELA. O rol de verbas que deduzem é
**parâmetro em tabela** (a cláusula pede configurável), nunca constante no código — a mesma
disciplina do `RoteiroContabil`.

### 1.4 · Situação e estado de conservação do bem — **RECOMENDADO: derivada de movimentos**

> **5.19.12** — "controle da **situação em que o bem se encontra** com relação ao seu estado,
> exemplo: empréstimo, locação, manutenções"
> **5.19.17** — "controle da situação e do estado de conservação através do **registro dos
> inventários realizados**"
> **5.19.20** — "informando seu estado e **localização atual (no momento do inventário)**"

⚠️ **A 5.19.20 resolve a ambiguidade sozinha, e é preciso ler o parêntese.** "Localização
atual (no momento do inventário)" é, literalmente, um eixo temporal: a localização é a daquele
inventário, não a de hoje. Uma coluna `localizacaoAtual` perde a pergunta que a própria
cláusula faz.

**Alternativa recomendada:** situação, estado e localização são **derivados do último
movimento** de cada tipo até uma data — como o papel da pessoa (M19) é derivado dos movimentos
de concessão e encerramento. O inventário é um movimento com data própria.

### 1.5 · Débitos do veículo (licenciamento, seguro, multas) — **RECOMENDADO: fato com data**

> **5.20.3** — "Controlar os **débitos** dos veículos, tais como: licenciamento, seguro
> obrigatório, multas"

Mesma forma: "o veículo está em dia?" é pergunta com data. Recomendado: cada débito é um fato
com vencimento e baixa, e "em dia" é derivado — nunca uma flag.

---

## FAMÍLIA 2 — cardinalidade UM onde o documento pede UM OU MAIS

⚠️ **Dezesseis cláusulas das duas frentes dizem "múltiplas", "mais de um" ou "vários".** Foram
lidas uma a uma; quatro delas mudam modelo.

### 2.1 · Múltiplas previdências por funcionário — **RECOMENDADO: N-N desde o dia 1**

> **5.12.13** — "controlar **múltiplas previdências** para cada funcionário, informando no
> mínimo a matrícula previdenciária"

⚠️ **É a 5.10.2.6 outra vez, no eixo de pessoal.** Um `previdenciaId` no cadastro do servidor
começa certo (a esmagadora maioria tem uma) e quebra no primeiro caso de servidor com RPPS e
RGPS simultâneos — que existe, e é o caso que o cálculo da folha precisa acertar.

**Alternativa recomendada:** vínculo N-N com **matrícula previdenciária por vínculo** (a
cláusula pede a matrícula, e ela é DO VÍNCULO, não do servidor). A migração aditiva do ENT03a
é o modelo: a previdência única atual vira a primeira linha.

### 2.2 · Mais de um período de gozo para o mesmo período aquisitivo — **RECOMENDADO: N-N**

> **5.12.31** — "lançamento de **mais de um período de gozo** para o mesmo período aquisitivo
> de licença prêmio"

⚠️ A licença prêmio se frui em parcelas. `periodoAquisitivo 1—1 periodoGozo` é a modelagem
óbvia e errada, e o erro só aparece na segunda parcela — quando já há dados.

**Alternativa recomendada:** `PeriodoAquisitivo 1—N PeriodoDeGozo`, com o guard de que Σ dos
dias gozados ≤ dias de direito. É a mesma aritmética da medição de obra contra o contrato.

### 2.3 · Pensão alimentícia para vários dependentes — **RECOMENDADO: N por dependente**

> **5.12.75** — "lançamento de pensão alimentícia para **vários dependentes** de um mesmo
> funcionário"

⚠️ **Cada pensão tem beneficiário, percentual e conta bancária PRÓPRIOS**, e o depósito é
separado. Uma única linha de pensão por servidor obrigaria a somar percentuais e pagar num
depósito só — o que é errado juridicamente e invisível no holerite.

### 2.4 · Ata de registro de preço com vários órgãos aderentes — **CONFERIR**

> **5.17.40** — "cadastro dos registros referente à **ata de registro de preço**, bem como
> controlar os respectivos saldos"
> **5.17.72** — "itens da **intenção de licitação**, de forma que as secretarias que
> aderirem…"

⚠️ **"Controlar os respectivos saldos" é FAMÍLIA 1 e FAMÍLIA 2 ao mesmo tempo.** O saldo da
ata é por ITEM e por ADERENTE, e ele muda a cada ordem de compra. Modelado como coluna, ele
responde "agora"; modelado com um aderente só, ele quebra na primeira adesão de outra
secretaria.

**Alternativa recomendada:** o saldo da ata é Σ das ordens de compra emitidas contra ela, por
item, com corte por data — e a adesão é N-N entre ata e unidade. **Sem tabela de saldo.**

---

## FAMÍLIA 3 — efeito colateral durável antes de operação guardada

⚠️ **A varredura do ENT03a procurou esta forma em: alocação de numeração, entrada no outbox,
geração de documento e consumo de certificado.** Nas duas frentes novas, três sítios têm a
mesma anatomia.

### 3.1 · Reintegração reutilizando a MESMA matrícula — **ALERTA ALTO**

> **5.12.60** — "cadastro de **reintegração** de funcionário demitido/exonerado por decisão
> judicial, **reutilizando a mesma matrícula**"

⚠️ **Esta é a forma exata do `porNaFila`.** Se a reintegração gravar qualquer coisa
(o vínculo novo, o período aquisitivo, o histórico) ANTES de conferir que a matrícula está
livre — e ela NÃO está, porque o requisito é reutilizá-la —, a guarda de unicidade da
matrícula rejeita no meio, e o servidor fica com meio-vínculo gravado. Uma segunda tentativa
falha pelo lixo da primeira, e a reintegração fica impossível para sempre.

**Alternativa recomendada:** a conferência de viabilidade da reintegração (matrícula existe,
está desligada, a decisão está anexada) roda **antes de qualquer escrita**, como
`exigirFilaViavel` faz hoje. E o teste que prova é o de **duas tentativas**: a segunda tem de
poder suceder depois de a primeira falhar.

### 3.2 · Simulação de rescisão — **ALERTA ALTO**

> **5.12.59** — "**simular** uma folha de rescisão, de forma que **não seja efetivamente
> executado** o processo de desligamento e demais reflexos"

⚠️ **"Não seja efetivamente executado" é uma promessa de ausência de efeito colateral**, e
promessas assim se quebram em silêncio: basta a simulação alocar um número de folha, gravar um
log de cálculo ou consumir uma sequência. O sintoma aparece meses depois, como um buraco na
numeração que ninguém explica.

**Alternativa recomendada:** a simulação roda numa transação que **sempre faz rollback**, e um
teste prova a ausência contando as linhas de TODAS as tabelas antes e depois. É o mesmo
formato do `test/efeito-antes-da-guarda.test.ts`.

### 3.3 · Virada mensal da depreciação — **ALERTA MÉDIO**

> **5.19.38** — "rotina de **virada mensal**, efetuando o cálculo automático da depreciação
> para os bens cadastrados com data de início, dentro do mês corrente"

⚠️ Rotina em lote sobre N bens: se ela gravar bem a bem e falhar no de número 300, ficam 299
depreciados e o mês em estado indeterminado. Rodar de novo depreciaria os 299 **outra vez**.

**Alternativa recomendada:** tudo-ou-nada numa transação, com **idempotência pela
competência** — a mesma do `registrarAtualizacaoMonetaria` da dívida e da `ATUALIZACAO` do
precatório: o líquido da competência tem de ser zero antes de lançar.

---

## FAMÍLIA 4 — comparação de data por instante onde deveria ser data civil

⚠️ **A pendência `DATA-CIVIL-RESTANTES` foi fechada no ENT03b, e a guarda
(`test/data-civil.test.ts`) hoje lê as TRÊS formas — `getUTC*`, o corte do ISO e o
`Date.UTC(`.** As frentes novas nascem já sob ela. O que segue são os sítios em que a régua
civil **decide dinheiro**, e que por isso precisam de teste de fronteira desde o primeiro
commit:

| Cláusula | Onde um dia decide |
|---|---|
| **5.12.22/23** — perdas e prorrogações do período aquisitivo | um dia muda o direito a férias e o valor do terço |
| **5.12.2** — limite em dias para contratação por tempo determinado | o alerta dispara um dia cedo ou tarde |
| **5.18.12** — abertura e fechamento de inventário | a movimentação da noite do fechamento entra ou não |
| **5.18.14** — vencimento do estoque em 30 dias | material vencido servido como válido |
| **5.19.38** — virada mensal da depreciação | o bem adquirido em 31/12 à noite deprecia em dezembro ou em janeiro |
| **5.21.29** — período da medição de obra | **JÁ RESOLVIDO no ENT03b** — as bordas são inclusivas e civis |

---

## ⚠️ Uma quinta família, que esta varredura encontrou e que ainda não tinha nome

### 5 · O documento pede **CONFIGURÁVEL** e a implementação óbvia é **CONSTANTE**

| Cláusula | O que ela manda configurar |
|---|---|
| **5.12.83** | "permitir **configurar quais outras verbas** devem deduzir da margem" |
| **5.12.21** | "**configuração** de férias especiais, indicando número de dias de direito" |
| **5.12.88** | "**configuração** para que ao empenhar a rescisão gere estorno nos saldos de provisão" |
| **5.13.6** | "**configuração** para indicar se a data de entrega e o número do protocolo do atestado são obrigatórios" |
| **5.18.3** | "possibilitando indicar seus **limites mínimos**" (por material) |

⚠️ **É a mesma armadilha do roteiro contábil, num domínio novo.** O repositório já tem a
resposta e ela é uma regra fixada: **nenhum código no código** — roteiro é TABELA, e ausente
RECUSA em vez de escolher um plausível. Uma constante `VERBAS_QUE_DEDUZEM` no arquivo da
margem começaria certa para Anita Garibaldi e erraria em silêncio no primeiro ente seguinte.

**Alternativa recomendada:** cada um destes vira **parâmetro em tabela**, fail-closed —
parâmetro ausente recusa a operação nomeando o que falta. É o que `RoteiroConvenio`,
`RoteiroPrecatorio` e `RoteiroConsorcio` já fazem.

---

## Resumo das decisões pedidas — todas de uma vez

| # | Decisão | Recomendação | Custo se decidida DEPOIS |
|---|---|---|---|
| 1 | Posição de estoque | Σ dos movimentos até data civil; inventário guarda juízo | migração de dados + reescrita do balanço patrimonial |
| 2 | Preço médio | derivado + gravado no movimento de saída | lançamentos contábeis irreproduzíveis |
| 3 | Margem consignável | função da competência, verbas em tabela | empréstimo autorizado contra margem inexistente |
| 4 | Situação/estado/localização do bem | derivados do último movimento até a data | o inventário perde a pergunta que a 5.19.20 faz |
| 5 | Débitos do veículo | fatos com vencimento e baixa | — |
| 6 | Previdências do servidor | N-N com matrícula por vínculo | migração aditiva, como a conta multifonte |
| 7 | Períodos de gozo | 1—N com guard de Σ ≤ direito | corrigir folha já paga |
| 8 | Pensão alimentícia | N por dependente, com conta própria | depósito errado, e ele é judicial |
| 9 | Saldo e adesão da ata | Σ das ordens por item; adesão N-N | a 2ª secretaria que aderir |
| 10 | Reintegração | viabilidade ANTES de qualquer escrita; teste de 2 tentativas | servidor impossível de reintegrar |
| 11 | Simulação de rescisão | rollback garantido + teste de contagem | buraco de numeração sem explicação |
| 12 | Virada da depreciação | tudo-ou-nada + idempotência por competência | depreciação em dobro |
| 13 | Os cinco "configuráveis" | parâmetro em tabela, fail-closed | constante errada no 2º ente |

⚠️ **Nenhuma delas exige contato externo, e nenhuma depende de credencial.** São todas
decisões de MODELO, e o custo de tomá-las agora é uma conversa; o de tomá-las depois é
migração de dados sobre fatos que o tribunal já recebeu.
