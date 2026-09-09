
## Bloco 4 — DÍVIDA CONSOLIDADA / FUNDADA (TR 5.82, 4.64, 5.8, 4.48)

### ⚠️ ONDE CADA LANÇAMENTO É FEITO — a decisão que o spec pedia para eu derivar

A dívida **não tem** roteiro de ingresso nem de amortização, e isso **não é** falta:
os dois lançamentos já são feitos por quem é dono do fato, e um roteiro próprio aqui
creditaria/debitaria o passivo **duas vezes**.

| Fato | Quem contabiliza | Lançamento |
|---|---|---|
| **Ingresso** (operação de crédito) | **M04** — é receita orçamentária | D caixa / **C conta da dívida**. É fato **permutativo**: o ente não ficou mais rico, ficou mais endividado. **NÃO há VPA.** O roteiro da arrecadação já vem por parâmetro — a perna credora aponta para o passivo. |
| **Amortização** | **M05** — é despesa orçamentária (grupo 6) | Liquidação: **D conta da dívida** / C fornecedores. Pagamento: D fornecedores / C caixa. Pagar principal também é **permutativo** — não é VPD. O roteiro da liquidação já vem por parâmetro. |
| **Atualização monetária** | **M10** (`RoteiroDivida`) | D VPD (variação monetária) / C passivo. O **único** sem contrapartida orçamentária — e aqui o patrimônio **diminui de verdade**: correção é despesa. |

**A amarração que isso cria:** `saldoDaDivida` (Σ dos movimentos, via `SINAL_MOVIMENTO_DIVIDA`)
tem de bater com o saldo da **conta contábil** da dívida no razão. Duas leituras
independentes do mesmo passivo — o t1 as confronta (41.200,00 dos dois lados).

### O dinheiro órfão morreu

O ingresso vinculado a `ReceitaArrecadada` dá **fonte** ao caixa da operação de
crédito. A **S1** do superávit por fonte (que acusava "há R$ 2.000 no caixa que nenhum
fato com fonte explica") **para de acusar** — provado no `m12-superavit-fonte.test.ts`.
O teste do órfão por **lançamento direto** segue intacto como detector.

E a dívida **não desconta** do superávit financeiro: ela é **permanente** (art. 105,
§ 4º — amortizar depende de autorização legislativa). O **caixa** dela entra; a dívida
não sai. É o art. 43, § 2º ("conjugando-se ... as operações de crédito") na prática —
a pendência da conjugação segue de pé.

### Pendências declaradas

- ~~**NÃO existe entidade que diga "esta natureza é operação de crédito"**~~ ✅ **CURADO**
  — os classificadores de natureza do M04 (`origemDaNatureza`). A pendência dizia que
  faltava uma **tabela de ORIGEM** e que por isso o guard se contentaria com a
  **categoria**. **O erro estava na premissa**: a origem nunca precisou de tabela — ela
  é o **2º dígito do código que já estava lá**, e uma tabela seria a segunda verdade
  sobre ele. A muleta barrava o IPTU e **deixava passar** a alienação (2.2), a
  amortização de empréstimos concedidos (2.3) e a transferência de capital (2.4): todas
  são receita de capital, **nenhuma** é dinheiro emprestado ao ente. O guard hoje exige
  `OPERACOES_DE_CREDITO` (t6b prova o aperto com o convênio 2.4).
- **Sem motor de índice**: a atualização monetária é **informada**. Calcular IPCA/IGP-M
  exigiria uma série oficial que o repositório não tem.
- **TR 4.50 (obras/medições)** segue fora — o módulo não existe.
- **Corrida no `pagar()`**: o guard "pago <= liquidado" soma dentro da transação **sem
  lock na liquidação** — a mesma classe de bug da ficha (6fa5d4e) e do contrato
  (e0e7e9f). A **dívida** já está travada; a **liquidação** não. Próximo da fila.

## Bloco 5 — DÍVIDA ATIVA (TR 5.83, 4.63; art. 39 da Lei 4.320/64)

O crédito do ente contra o **contribuinte** — o espelho da dívida consolidada.

| Fato | Quem contabiliza | Lançamento |
|---|---|---|
| **Inscrição** | M10 (`RoteiroDividaAtiva`) | D ativo / C VPA — o patrimônio **cresce**: o ente reconhece um crédito que não tinha. |
| **Atualização** (juros, multa, correção) | M10 | mesmo par — o acréscimo é VPA. |
| **Cancelamento** (prescrição, remissão, decisão judicial) | M10 | D VPD / C ativo — o crédito morre, e a perda é despesa. |
| **Recebimento** | **M04** — é receita orçamentária | D caixa / **C ativo**. Fato **permutativo**: um ativo vira outro. **NÃO há VPA** — ela já foi reconhecida na inscrição, e reconhecê-la de novo contaria a mesma receita **duas vezes**. **Sem roteiro próprio, por design** (espelho do ingresso de operação de crédito). |

**A prova de que o recebimento não pode ter roteiro:** no t6, o A1 do Anexo 14 fecha
em 10.000 (ativo 4.000 de caixa + 6.000 de dívida ativa == PL 10.000 da VPA da
inscrição). Com um roteiro próprio, o PL seria 14.000 e o **balanço não fecharia**.

### ⚠️ O FURO, NOMEADO (não é meia-trava — é uma trava que falta)

O caminho de **ida** está trancado: `receberDividaAtiva` recusa receita anulada. O de
**volta** está **aberto**: o **M04 não sabe que existe dívida ativa**, e
`anularArrecadacao` **não** estorna o RECEBIMENTO. Quem anular a receita **depois** de
recebê-la deixa a dívida baixada e o dinheiro desfeito. Fechar isso exige um **port no
M04** (o desenho do `ContratoPort` do M11) — cirurgia que não cabia neste bloco.

### Outras pendências

- **Nada força a vinculação INTEGRAL da guia.** O roteiro da arrecadação credita o
  ativo pelo valor **inteiro** da receita; se só parte for vinculada, o razão baixa a
  dívida além dos movimentos. A amarração `conferirDividaAtivaContraRazao` **detecta**
  (t1/t6 a usam), mas o serviço **não impede**.
- ~~**Baixa automática por tipo de receita**: inimplementável — não há classificação que
  diga "esta receita é de dívida ativa"~~ ✅ **A CLASSIFICAÇÃO EXISTE** — é o **8º dígito**
  do código (`tipoDaNatureza`), e ele estava lá o tempo todo. Este era o **mais
  degradado dos guards**: o `receberNaTx` não olhava a natureza **nem uma vez** — a guia
  do IPTU do exercício corrente quitava dívida ativa, e o crédito **inscrito** sumia do
  ativo sem que ninguém o pagasse. Hoje só os tipos **3** (dívida ativa) e **4** (multas
  e juros **dela**) quitam; o **1** (principal) é recusado nomeando (t1b). A **baixa
  automática** — casar guia com CDA sozinho — segue **manual**: o código diz *que tipo de
  receita é*, não *qual inscrição* ela paga.
- **Competência (TR 5.87/5.88)**: fora deste bloco; a tabela de roteiro a absorve.
- **Indicador F/P**: é **parâmetro**. A fixture escolhe **P** (dívida ativa de longo
  prazo). O art. 105 dá as duas leituras — § 1º (realizável sem autorização
  orçamentária → F) e § 2º (mobilização depende de lei → P). Quem decide é o PCASP do
  ente.

## FIX ESTRUTURAL M04↔M10 — o fato permutativo tem DUAS pernas

Os dois furos nomeados em `a98f0a5` estão **fechados**. A cura é a mesma da retenção
do M07 dentro do `pagar()`: **a operação composta é a dona das duas pernas**.

### 1. Operações compostas (uma transação, um fato)

`arrecadarRecebimentoDividaAtiva` e `arrecadarIngressoOperacaoCredito` — a arrecadação
(M04) e o movimento da dívida (M10) nascem **juntos**. `receberDividaAtiva` e
`registrarIngressoOperacaoCredito` **saíram da API pública**: virar meio fato deixou de
ser possível.

**Σ dos vínculos == valor da guia, EXATO.** A arrecadação credita a conta pelo valor
**inteiro**; vincular menos deixaria o razão baixando o que os movimentos não baixaram.
Uma guia pode quitar **várias** dívidas — mas a soma tem de fechar com ela.

### 2. `ContaReservadaPort` — a entrada lateral

Arrecadar **avulso** numa conta de dívida é **barrado**. O M04 pergunta ("esta conta é
gerida por alguém?"); o M10 responde. ⚠️ **Ausente = fail-open, e é correto**: um módulo
ausente não pode travar o M04, e a amarração razão×movimentos segue como detector de
fundo.

### 3. `AoAnularArrecadacaoPort` — o caminho de volta

Anular a arrecadação **estorna, na mesma transação**, todos os recebimentos e ingressos
vivos que ela gerou. Cada um com o **seu** valor (nunca um valor único recarimbado — a
lição do `resolverPartidas` do M08). A porta do estorno **avulso** segue fechada: o
caminho é anular a arrecadação.

**Ordem dos locks na cascata**: dívida consolidada (posto 5) **antes** da dívida ativa
(posto 6) — o `packages/locks` recusa a inversão em tempo de execução.

### Zero ciclo

`m10 → m04` (já existia). O M04 **declara** os ports; o M10 os **implementa**
(`adapter-m04.ts`); a composição injeta (`criarM04DepsComDividas`). Mesmo desenho do
`ContratoPort` (M11).

## Bloco 6 — ALMOXARIFADO (TR 5.85/5.86) e PROVISÕES (TR 5.89)

### A entrada não tem roteiro — e é a competência do MCASP

| Fato | Quem contabiliza | Lançamento |
|---|---|---|
| **Entrada** (compra) | **M05** — a liquidação | **D estoque** / C fornecedor. Fato **permutativo**: o dinheiro vira material. O roteiro da liquidação já vem por **parâmetro** (passo 0: nenhum hardcode de VPD no M05). |
| **Saída por consumo** | M10 | D VPD (consumo) / C estoque — **é aqui que a despesa nasce**. |
| **Ajustes de inventário** | M10 | sobra (D estoque / C VPA) e falta (D VPD / C estoque). |

**⚠️ A despesa patrimonial NÃO nasce na compra, nasce no CONSUMO.** Um almoxarifado
cheio não empobreceu o ente — ele trocou dinheiro por material. Debitar VPD na aquisição
reconheceria a despesa antes do uso, e o resultado do exercício absorveria o estoque que
ficou na prateleira. **Prova (t1):** VPD do período = 2.000 (consumo + falta), não 5.000
(a compra). E a amarração razão×movimentos fecha em 3.000 nos dois lados — com um
roteiro de entrada, o estoque seria debitado **duas vezes**.

### A reversão de provisão é FATO NOVO, não estorno

O cálculo atuarial mostrou que o ente deve **menos**: isso é **ganho** do exercício em
que se descobriu (D passivo / **C VPA**). O **estorno** existe para o outro caso — a
provisão lançada **errada** —, e ele **inverte as pernas**, sem gerar VPA. Confundir os
dois faria o resultado absorver, como ganho, a correção de uma digitação.

### O indicador do estoque: **P**, e a razão

Art. 105, § 1º: ativo **financeiro** são "créditos e valores realizáveis
independentemente de autorização orçamentária e os valores numerários". Material de
almoxarifado **não é crédito nem numerário** — ele não se realiza, ele se **consome**. E
pelo § 2º é **bem**, cuja alienação depende de autorização legislativa. Consequência
provada no t6: **não se paga fornecedor com caneta** — o superávit financeiro **não
conta** com o estoque. (A provisão, 2.2, também é P.)

### ~~FURO: a anulação da liquidação NÃO cascateia~~ ✅ CURADO (TR 5.35)

O `AoAnularLiquidacaoPort` nasceu no bloco da TR 5.35: anular a liquidação (TOTAL ou
PARCIAL) cascateia até o almoxarifado, na MESMA transação. **A porta do estorno avulso
da ENTRADA foi FECHADA** — ela ficou aberta enquanto a porta certa não existia, e o
porquê fica no histórico: *uma porta fechada só é defensável quando existe a porta
certa*. E a cascata é **fail-closed**: se o material já foi CONSUMIDO, a anulação
INTEIRA é rejeitada (não existe "anulou a liquidação mas o material continua
consumido").

<details><summary>O furo, como estava declarado</summary>

### ⚠️ FURO NOMEADO: a anulação da liquidação NÃO cascateia

O M05 **não tem** `AoAnularLiquidacaoPort` — o precedente do M04 (`AoAnularArrecadacaoPort`,
1ee2ba3) **não foi replicado ali**. Anular a liquidação inverte o razão (o estoque volta
a zero) e deixa o **movimento de entrada vivo**. É o **mesmo furo** da dívida ativa
(a98f0a5), e a **cura é a mesma**: operação composta (liquidar + entrada) + porta de
cascata. **O t8 prova o que a amarração VÊ**: ela acusa a entrada órfã, nomeando os
5.000.

**E é por isso que a porta do estorno da ENTRADA fica ABERTA.** Uma porta fechada só é
defensável quando existe a porta certa. Sem cascata, o estorno avulso é o **único**
caminho de correção — fechá-la deixaria o erro **sem conserto**.

**Vinculação parcial**: a liquidação debita o estoque pelo valor **inteiro**; se só parte
virar ENTRADA, o razão fica à frente dos movimentos. Com chamadas **separadas** (uma por
classe) **não há como exigir a soma exata** — a primeira entrada de 3.000 numa liquidação
de 5.000 falharia. É precisamente por isso que a cura é a **composta**. A amarração
**detecta**; o serviço não impede.

### Outra pendência

~~**Não há rol de ELEMENTOS de despesa no repo**~~ ⚠️ **ESTA NOTA ESTAVA ERRADA, e o passo
0 do M13 a desmentiu.** O rol **existe** desde `c70e907`:
`prisma/seed/dados/elementos.ts`, **78 elementos**, Anexo II da Portaria 163/2001,
conferido por teste. Eu olhei `natureza-componentes.ts` (categorias, grupos e
modalidades), não achei elementos lá, e concluí que não existiam em lugar nenhum — sem
procurar no resto da pasta de seed.

Consequência: o guard **"entrada de almoxarifado só de elemento 30 (material de
consumo)"** era construível o tempo todo. ✅ **CONSTRUÍDO** — ver abaixo.

</details>

## O guard do ELEMENTO no almoxarifado (TR 5.85)

`ELEMENTOS_DE_ALMOXARIFADO` é um **Record fechado**: hoje, `{ "30": true }`. Uma
liquidação cujo empenho tenha outro elemento **não dá entrada de estoque** — e a mensagem
nomeia o elemento, a **descrição oficial** dele (vinda de `exigirElementoOficial`, no M02,
dono da classificação) e o rol vigente.

Sem o guard, uma consultoria de 5.000 (elemento 39) virava "material": o razão do estoque
inflava e o inventário nunca fechava.

### Por que só o 30 — e por que o 32 fica FORA

Os elementos com "Material" no nome, **literais** do rol oficial:

| Código | Nome (Anexo II da Portaria 163/2001) | No almoxarifado? |
|---|---|---|
| **30** | Material de Consumo | ✅ **É o almoxarifado.** |
| 32 | Material, Bem ou **Serviço** para Distribuição Gratuita | ❌ **PENDÊNCIA — é decisão.** |
| 52 | Equipamentos e Material **Permanente** | ❌ É bem patrimonial (outro livro). |

O **32** tem "Material" **e** "Serviço" no mesmo nome: parte dele é estoque (a cesta
básica que espera no depósito até ser distribuída), parte não é (o serviço prestado direto
ao beneficiário). **Qual parte? O código não sabe, e o rol não diz.** Incluí-lo *"porque
tem Material no nome"* seria **inferir** — e o precedente é fresco: em `ca052dc` os
benefícios assistenciais ficaram **fora** da exceção do beneficiário pelo mesmo motivo (a
regra nomeava *"folha ou previdência"*, não *"assistência"*).

Quando o ente disser como trata o 32, ele entra **numa linha**. Enquanto ninguém disser,
ele é recusado com uma mensagem que aponta a **decisão** — não um bug. O `t10` testa
exatamente isso.

---

## Classificadores de natureza da receita — os TRÊS guards que apertaram

Origem (2º dígito) e tipo (8º) nasceram no M04 e curaram, de uma vez, três guards que o
M10 carregava degradados **pelo mesmo motivo**: o repositório não classificava a receita,
e cada guard se contentou com o que dava para exigir sem inventar.

| Guard | Exigia (degradado) | Exige agora | Deixava passar |
|---|---|---|---|
| Ingresso de op. de crédito (4.64) | receita de **CAPITAL** | origem `OPERACOES_DE_CREDITO` (2.1) | alienação (2.2), amortização de empréstimos concedidos (2.3), **convênio (2.4)** — passivo fabricado sobre dinheiro que ninguém emprestou |
| Alienação (4.65) | receita **existe e está viva** | origem `ALIENACAO_DE_BENS` (2.2) | **qualquer receita** — o bem saía do ativo e o ganho era calculado contra dinheiro que entrou por outro motivo |
| Recebimento de dívida ativa (4.63) | **nada** sobre a natureza | tipo `DIVIDA_ATIVA` (3) ou `MULTAS_E_JUROS_DA_DIVIDA_ATIVA` (4) | a guia do **IPTU corrente** quitando a inscrição — o crédito sumia do ativo sem que ninguém o pagasse |

**Nenhuma tabela nova, nenhuma coluna nova.** A classificação sempre esteve no código de
8 dígitos da `NaturezaReceita`; o que faltava era **lê-lo**. Uma tabela de origem/tipo
seria a segunda verdade sobre o mesmo código.

**O caminho da alienação (`receitaArrecadadaId`) nunca tinha sido exercitado por teste
nenhum** — o t7 do `m10-alienacao.test.ts` é o primeiro. A perna credora da arrecadação
aponta para o **crédito por alienação** (a mesma conta que o roteiro do GANHO debita):
receber o dinheiro da venda é **permutativo**, e uma VPA ali contaria o ganho duas vezes.
