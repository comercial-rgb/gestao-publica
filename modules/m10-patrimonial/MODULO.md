
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

### V36 — parcelas informadas e o relatório da dívida (TR 5.10.1.84 e 5.10.1.86)

- **A parcela é PREVISÃO, não fato** (`ParcelaDaDivida`, `parcelas-da-divida.ts`): número, vencimento, principal e
  encargos, como o contrato diz. Não toca razão nem saldo, e o sistema **não calcula amortização** — Price, SAC ou
  carência são do contrato. Append-only: corrigir é gravar outra com `substituiDeId`; viva é a não substituída.
  Autoridade: `CADASTRAR_DIVIDA` (o cronograma é parte do contrato).
- **O comparativo é por período, não quitação**: cada parcela recebe o amortizado entre o vencimento anterior
  (exclusive) e o dela (inclusive), pelo dia civil do ente, sem as amortizações estornadas; o pago depois do último
  vencimento tem linha própria. O pagamento não diz a que parcela se refere — atribuir pagamento a parcela seria
  decisão do usuário, e não foi tomada.
- **Juros e encargos sem comparativo**: a guarda do empenho só aceita dívida no grupo 6, então o pagamento de juros
  não se liga à dívida. Relaxar isso é decisão de modelo (contábil), não de tela.
- Tela `/relatorios/divida` (todas as dívidas, e `?divida=` com as parcelas), CSV e PDF.

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


## Orquestração V3 (4.5) — os roteiros são versionados

`roteiros.ts` deixou de atualizar `RoteiroPatrimonial` em silêncio. Cada parametrização é
uma linha de `VersaoDeRoteiro` (família, chave, número, par, motivo, autor e momento da
proposta, autor e momento da publicação). `proporVersaoDeRoteiro` valida pelo motor e grava
PROPOSTA; `publicarVersaoDeRoteiro` (ação própria, `PUBLICAR_ROTEIRO_PATRIMONIAL`) põe em
vigor; `parametrizarRoteiroPatrimonial` continua como ato composto e por isso cobra os dois
crachás. O resolvedor `roteiroDoTipo` lê a versão em vigor (a PUBLICADA mais recente) e só cai
na linha legada enquanto não há versão; o movimento grava `versaoDeRoteiroId`. Vigência é
derivada. Concorrência é do índice único `(familia, chave, numero)`; repetição é recusada
nomeando. ADR: `docs/adr/ADR-versoes-de-roteiro-e-banco-de-percursos.md`. Testes:
`m10-roteiros-versoes.test.ts`.

**Pendência preservada:** `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` continua sendo decisão do
contador do ente; `seed:roteiros-demo` é configuração de DEMONSTRAÇÃO, identificada como tal
no motivo de cada versão, para os percursos — não homologação.


## Orquestração V3 (pacote 2, unidade 1) — a pesquisa do acervo e "meus bens"

`lib/portas/recursos/acervo-dados.ts` deixou de listar pelo Prisma: a lista pesquisa por
identificador (tombamento, código de barras, descrição), classe, localização, responsável
(nome ou documento), situação e estado de conservação, e mostra o estado ATUAL de cada bem.
Localização, responsável, situação e estado não são colunas do bem — são o último movimento
vivo de cada eixo — e por isso a listagem os deriva em SQL (`DISTINCT ON (bem, tipo)`,
ordenado pelo dia civil do movimento e pelo instante do registro, com o estorno anulando o
original), que é a mesma regra de `estadoDoBemEm`. Tudo parametrizado; nenhum filtro entra
na string. `test/acervo-pesquisa.test.ts` confronta o SQL com o domínio na mesma fixture,
inclusive depois de um estorno e com dois movimentos no mesmo dia registrados fora de ordem.

"Meus bens" (`/patrimonio/meus-bens`) deriva em dois passos explícitos: a PESSOA do usuário
(`servico-pessoa-do-usuario.ts`, M16 — vínculo explícito, opcional, auditável, pelo
documento, sem conceder permissão) e depois `bensSobResponsabilidade`. Sem vínculo, a tela
diz que o vínculo está pendente e quem resolve; ela não procura a pessoa pelo nome.


## Orquestração V3 (pacote 2, unidade 2) — motivo de baixa no ato, reavaliação e alienação na tela

**O motivo de baixa do rol (TR 5.19.30) passou a ligar-se ao ATO.** `MovimentoPatrimonial`
ganhou `motivoDeBaixaId` (FK RESTRICT para `MotivoDeBaixa`, migration aditiva); `baixarBem` e
`alienarBem` aceitam o motivo, conferem dentro da transação que ele existe e está ATIVO
(inativo ainda classifica as baixas antigas, não uma nova) e citam o código no histórico do
lançamento. O texto livre em `motivo` continua sendo o histórico — o pedido manda preservar.
Na alienação, o motivo vai na baixa do valor BRUTO (o ato); a baixa da acumulada é
retificadora e anda em par pelo `operacaoId`. Prova: `m10-baixa-motivo.test.ts` (N=2: ativo e
inativo; recusa nomeada com nada gravado) e `m10-alienacao.test.ts` t9.

**A alienação integra-se à receita PELA GUIA.** `receita-da-alienacao.ts` acha a arrecadação
por (exercício, número, ARRECADACAO) — a chave única `uq_receita_guia` — e só acha: quem
decide se ela sustenta a venda (viva, não anulada, origem 2.2) continua sendo `alienarBem`,
dentro da transação. Nenhum UUID chega ao operador. Prova: `m10-alienacao.test.ts` t8.

**No detalhe do bem** (`/patrimonio/bens-patrimoniais/[id]`): "Baixar do acervo" pede o motivo
do rol (opções = motivos ativos) e o histórico; "Reavaliar" (aumento/redução, crachá
`REGISTRAR_REAVALIACAO`), "Registrar redução ao valor recuperável" (`REGISTRAR_IMPAIRMENT`)
e "Alienar" (`ALIENAR_BEM`) são ações novas. Na alienação o valor bruto e a acumulada NÃO são
perguntados: a porta os deriva do próprio bem (`valorBrutoDoBem`, `valorContabilDoBem`) —
pedi-los seria a armadilha que o aviso da baixa denuncia. O histórico do bem mostra o motivo
do rol e a guia da receita ao lado do texto. Sem roteiro parametrizado para o tipo, o domínio
recusa nomeando (`ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` continua sendo decisão do contador).


## Orquestração V3 (pacote 2, unidade 3) — parâmetro versionado, prévia e memória de cálculo

**O parâmetro de atualização (método, vida útil, residual) é versionado.** `parametros.ts`:
`definirParametroDeAtualizacao` (ação própria `DEFINIR_PARAMETRO_DE_ATUALIZACAO`; atualização
de permissões v4 deriva de quem parametriza roteiro) grava `VersaoDeParametroDeAtualizacao`
com número sequencial por classe, autor, momento e motivo; `parametroVigente` lê a última
versão e só cai na linha legada `ParametroAtualizacaoClasse` enquanto a classe não tiver
versão — a linha legada é origem, não configuração. Encerrar a atualização é uma versão com
`ativo = false`. A regra do parâmetro é UMA (`validarParametrosDaClasse`, a mesma de
`calcularParcela`): versão inválida não nasce. Concorrência é do índice único
`(classe, numero)`; versão idêntica à vigente é recusada.

**A prévia é a mesma conta da atualização, sem escrever.** `preverCompetencia` devolve
parâmetro, base, contábil, já aplicado, cálculo e a situação (PRONTA, SEM_PARAMETRO,
PARAMETRO_INATIVO, JA_ATUALIZADA, TOTALMENTE_ATUALIZADA) com a recusa nas mesmas palavras;
`atualizarCompetencia` a chama dentro da transação e recusa com ela. Não há duas contas.

**A memória de cálculo vai na mesma transação.** `MemoriaDeAtualizacao` (uma por movimento:
versão do parâmetro, método, vida útil, residual, base, contábil antes, residual, parcela
cheia, teto, parcela) é gravada com o movimento e o lançamento; se ela não gravar, nada
existe. É o que responde "por que 450,00?" depois que o parâmetro mudou.

**Telas:** `/patrimonio/parametros-de-atualizacao` (molde; todas as classes ativas,
parametrizadas ou não; detalhe com histórico de versões; ações "definir" e "encerrar";
residual pedido em porcento) e `/patrimonio/competencia` (prévia por GET com a memória,
processar por POST com chave de comando, histórico do processado com a memória de cada um).
Provas: `m10-parametros-versoes.test.ts` (N=2 versões; prévia não escreve; memória aponta
para a versão que calculou; encerrar; origem legada; concorrência; negação nomeada) e
`m10-competencia.test.ts` intacto (a régua não mudou de lugar).


## Orquestração V3 (pacote 2, unidade 4) — o estorno com análise de dependências

`estorno.ts`: `analisarEstornoPatrimonial` e `analisarEstornoDeGestao` (leitura). Depende
quem FICARIA INVÁLIDO com o estorno: (a) a atualização por competência posterior, quando o
movimento compõe a base; (b) a redução posterior (baixa, doação realizada, impairment,
reavaliação para menos), quando o movimento é um aumento — o teto a incluía; (c) a baixa da
acumulada de uma alienação, quando o movimento é uma atualização acumulada. Nesses casos
`estornarMovimentoPatrimonial` — que refaz a análise DENTRO da transação — recusa nomeando
os dependentes: estorne do mais recente ao mais antigo. Posteriores do mesmo bem que não
caem em (a)–(c) são informação. Os irmãos da operação (alienação) e o lançamento do resultado
são ARRASTADOS: desfeitos no mesmo ato, e a análise os nomeia. A ordem é a do REGISTRO
(`criadoEm`), porque base e teto foram conferidos contra o que existia ao registrar. O eixo
de gestão não tem base nem teto: a análise mostra o par da transferência e os posteriores do
mesmo eixo; nada bloqueia.

Tela: `/patrimonio/estornos/{valor|gestao}/[id]`, alcançada pelos links "analisar estorno"
do histórico do bem (`LinhaDoHistorico.href`, V3) e da lista de competências processadas. O
botão só aparece sem bloqueio e com o crachá do eixo; o estorno leva chave de comando. Prova:
`m10-estorno-dependencias.test.ts` (N=2 bens; LIFO libera; bloqueios nomeados; gestão
informativa) e `m10-alienacao.test.ts` t10 (arrastados e resultado). Os testes anteriores de
estorno passam sem mudança: nenhum deles estornava fora de ordem.


## Orquestração V3 (pacote 2, unidade 5) — termos com PDF e etiquetas imprimíveis

**Etiquetas (TR 5.19.2).** `packages/codigo-de-barras` gera Code 128 em SVG com `bwip-js`
(a versão JavaScript do BWIPP, gerador de referência); o teste lê as barras de volta com um
DECODIFICADOR PRÓPRIO escrito da especificação (tabela dos 107 símbolos, START/STOP,
verificador mod 103, conjuntos A/B/C com trocas) — parser contra implementação
independente, e a prova de que acusa (uma barra alargada derruba a leitura). Fora do ASCII
imprimível a geração RECUSA nomeando: a etiqueta tem de dizer exatamente o que o cadastro
diz. A folha (`/patrimonio/etiquetas?bens=…`) é leitura: desenha só códigos já gravados por
"Gerar etiqueta" (idempotente); bem sem código aparece fora da folha com o caminho.
Individual pelo detalhe do bem ("relacionados"), em lote pela seleção da lista do acervo.

**Termos (TR 5.19.36, 5.19.37).** `emitirTermoPatrimonial` já registrava o movimento na mesma
transação; ganhou tela (`/patrimonio/termos`, molde: bens pelo TOMBAMENTO, resolvidos na
porta com recusa nomeada; termo imutável, sem ações) e PDF (`/patrimonio/termos/[id]/pdf`,
rota autenticada com o mesmo motor e rodapé dos demonstrativos). `termo-documento.ts` compõe
o documento como DADO — cabeçalho com o responsável (nome e documento formatado), uma linha
por bem com valor contábil e localização DERIVADOS no momento da impressão, total somado,
declaração e linhas de assinatura — sem conhecer PDF nem HTML. Prova:
`m10-termo-documento.test.ts` (N=2 bens; responsabilidade e baixa; inexistente recusa) e
`codigo-de-barras.test.ts`.


## Orquestração V3 (pacote 2) — o percurso das cinco unidades, e o que ele acusou

`scripts/smoke-pacote2.ts` (`npm run smoke:pacote2`, contra `next dev -p 3010` sobre o banco
dos percursos): 30 passos, 0 falhas — acervo pesquisável (tombamento, responsável), etiqueta
gerada e impressa com o SVG, parâmetro versionado, prévia/processamento/memória da
competência, estorno bloqueado pela dependência e liberado na ordem certa, termo emitido
com PDF renderizado pela rota autenticada, vínculo usuário↔pessoa e "meus bens".

**O que o percurso acusou:** o `case "gerar-etiqueta"` do despachante do bem tinha sumido no
commit bb47320 (ENT12) — o comentário que o explicava ficou, o código não — e a ação caía no
`default` ("não existe neste cadastro") desde então. Restaurado; `test/ui/acoes-despachadas.test.ts`
passou a vigiar descritor × despachante (com a prova de que acusa).

**Decisão de tela:** as actions escritas à mão (competência, estorno) NÃO chamam
`revalidatePath`: o refresh do RSC desmontava o formulário (a prévia deixa de estar PRONTA) e
levava a resposta junto. A tela seguinte lê o banco ao abrir (`force-dynamic`).

## Sessão noturna V4 (§4) — a competência por bem, com corte, vigência e execução

Decisão inteira em `docs/adr/ADR-competencia-por-bem-corte-e-execucao.md`. O resumo operacional:

- `preverCompetencia(tx, {classe, competencia, bemId?})` devolve ITENS (um por bem elegível e,
  se houver, o acervo sem individualização), o CORTE, o parâmetro VIGENTE NA COMPETÊNCIA
  (`parametroVigenteEm`) e os totais dos prontos. Situações do item: PRONTO, JA_ATUALIZADO,
  TOTALMENTE_ATUALIZADO, NAO_ELEGIVEL (entrada após o corte), SEM_VALOR.
- `atualizarCompetencia` grava UMA `ExecucaoDeAtualizacao` (escopo CLASSE ou BEM), UM lançamento
  com a soma, N movimentos (itens, `operacaoId` = execução) e N memórias (com execução e corte).
  Estornar um item desfaz a execução da classe — o lançamento compartilhado é estornado uma vez.
- `VersaoDeParametroDeAtualizacao.vigenteDesde`: vigência de negócio; omitida, é derivada; uma
  vigência que alcance competência processada é recusada (retroativo é estornar e reprocessar).
- `estorno.ts`: dependência por IMPACTO (o posterior é refeito sem o movimento), ordem por
  `sequencia`. `exigirTetoDeReducao` cobra também o teto do bem.
- `conciliacaoDaClasse`: Σ bens + acervo sem individualização = classe (zero por construção) e a
  acumulada histórica sem bem (pendência `RECONCILIACAO-HISTORICA-DA-DEPRECIACAO-POR-CLASSE`).
- Pendências: `INICIO-DA-ATUALIZACAO-NO-MES-SEGUINTE`, `VIRADA-DE-TODAS-AS-CLASSES`.

## Sessão noturna V4 (§5) — a emissão congelada do termo, a posição atual e o termo assinado

Decisão em `docs/adr/ADR-emissao-congelada-do-termo.md`. `emitirTermoPatrimonial` compõe o documento
(`comporTermo`) e o grava com o termo (`emissao`, `modeloDaEmissao`, `emissaoSha256` do JSON canônico,
`emitidoEm`); `documentoDoTermo(tx, id, ente, via)` devolve a segunda via (EMITIDO, conferindo o sha256),
a posição atual (ATUAL, outro documento com data própria) ou o termo antigo composto agora (SEM_EMISSAO,
dito na nota). O termo assinado é `Anexo.termoPatrimonialId` (aba de anexos do detalhe; sha256 conferido
na entrega). Pendência `TERMO-ASSINADO-NAO-ANEXAVEL-PELA-TELA` fechada; nova: `ASSINATURA-QUALIFICADA-DO-TERMO`.

## Sessão noturna V4 (§6) — a liquidação de material como ato único (fecha LIQUIDACAO-MATERIAL-ALMOXARIFADO)

Decisão em `docs/adr/ADR-liquidacao-de-material-como-ato-unico.md`. O gatilho é a NATUREZA
(`elementoDebitaEstoque`, M01); a classe de material é configuração obrigatória e a sua ausência é
recusa nomeada; `AoLiquidarMaterialPort` grava as entradas (contábil + física opcional, que pode
CONSUMIR um recebimento do M11 por `recebimentoDeItemId`) na transação da liquidação; a liquidação é
travada uma vez antes das classes. A tela de liquidação abre as entradas quando o empenho é de
material. Pendências: `LIQUIDACAO-MISTA-POR-DOCUMENTO`, `RECEBIMENTO-COM-ENTRADA-FISICA-PREVIA-NA-LIQUIDACAO`.

## Pendências do estoque físico levantadas em V11 V9.1 (por medição, não por relatório)

Levantadas ao escolher a capacidade da rodada (o 13º ficou), e registradas aqui porque **marcar
ausência vale tanto quanto marcar presença**. Nada foi construído para elas.

- `REQUISICAO-DE-UM-ITEM-SO-NA-TELA` — o modelo está certo:
  `RequisicaoDeMaterial` tem `itens ItemDeRequisicaoDeMaterial[]`, e o atendimento parcial é
  derivado por item. Mas a TELA (`lib/portas/recursos/almoxarifado.ts`, o recurso
  `REQUISICOES_DE_MATERIAL`) cria requisição de **um** item — o próprio texto de ajuda do campo
  admite. Um setor que pede seis materiais abre seis requisições, e o controle de pendências que a
  5.18.8 promete fica espalhado por seis números. É superfície, não modelo: o caso de uso já aceita
  a lista.
- `ESTOQUE-FISICO-SEM-PERCURSO` — não existe `scripts/smoke-almoxarifado*`. Todo o eixo físico
  (depósitos, materiais, parâmetros, entrada, saída, transferência, estorno, requisição,
  atendimento, cotas, inventário, bloqueio) tem serviço, tela e teste, e **nenhum percurso de
  navegador**. Foi um percurso que achou o defeito da V8.16 que 3.310 testes não viam.
- **E uma marcação do catálogo que não se sustenta**: a cláusula 5.18.8 está
  `VALIDADO_LOCALMENTE` com `rota_verificada` VAZIA. Pela regra do catálogo,
  `VALIDADO_LOCALMENTE` exige tela **e** percurso; sem percurso, a marcação certa é
  `IMPLEMENTADO_NAO_VALIDADO`, que é o que as outras doze cláusulas de 5.18 já dizem.

## A anulação parcial na entrada de material e no bem (V33)

- **Teto da entrada no almoxarifado:** passou a ser a liquidação LÍQUIDA das parciais vivas. Pelo
  serviço, esse caminho não se monta: a entrada nasce no ato de liquidar e a cascata recusa a parcial
  abaixo do material. O teto só alcança liquidação gravada antes da regra da entrada no ato. Fica como
  defesa, sem teste próprio.
- **`adquirirBem` e a entrada:** recusam a linha da parcial como liquidação.
- **Teto de incorporação:** leva o estorno da parcial.

## V37 — duas linhas físicas na liquidação, e a perna física na anulação

- **Liquidação com duas linhas de entrada física.** O port processava linha a linha: classe (posto 13), posição (23) e
  a classe da linha seguinte depois da posição. A guarda de ordem recusava toda liquidação com duas linhas físicas, que
  a tela permite. Agora são duas passadas: todas as classes, depois todas as posições, cada uma na ordem da chave da
  trava (t9b do estoque físico).
- **Anulação total.** A cascata estornava só o movimento contábil da entrada. A perna física ficava viva, e o material
  de uma compra desfeita continuava na posição. `estornarEntradasFisicasDaLiquidacaoNaTx` estorna as entradas físicas
  da liquidação por fato novo, na mesma transação e na mesma data do estorno contábil. Se o material daquela posição
  ou daquele lote já saiu, a anulação inteira é recusada, nomeando material, depósito e quantidades (t9c e t9d). A
  conferência é por posição, porque a classe pode ter saldo de outras compras.
- **Material por busca na tela da liquidação.** O catálogo `materiais-de-estoque` só oferece os materiais da classe
  escolhida na linha. Ele substitui o `select` com até 2.000 materiais.

## V37 — o roteiro do almoxarifado ganhou escritor, e o material do almoxarifado virou busca

- **`RoteiroAlmoxarifado` não tinha caso de uso nem tela.** O lançamento da saída por consumo e dos ajustes é
  fail-closed ("Não há RoteiroAlmoxarifado cadastrado..."), então nenhuma requisição se atendia pela tela, em base
  nenhuma; só os testes gravavam a tabela, por `createMany`. `parametrizarRoteiroAlmoxarifado` (em `roteiros.ts`)
  grava o par de um dos movimentos com lançamento próprio que não são estorno (`TIPOS_DO_ROTEIRO_ALMOXARIFADO`,
  derivado de `TEM_ROTEIRO_ALMOXARIFADO`), conferindo as contas pelo mesmo `conferirConta` e pelo motor do M01
  (`conferirContraOMotor`). Exige os dois crachás da parametrização direta do patrimônio (parametrizar e publicar),
  porque vigora na hora. Tela: `/patrimonio/almoxarifado/roteiros`, com as contas por busca (`contas-patrimoniais`,
  analíticas das classes 1 a 4). Nenhuma conta é sugerida.
- **Sem substituição.** O tipo que já tem roteiro é recusado nomeando o par vigente. Trocar as contas pede versão,
  como a do patrimônio: pendência `ROTEIRO-ALMOXARIFADO-SEM-VERSAO`.
- **Observação, não alterada:** o par é um por movimento, não por classe de material. A conta de estoque da classe
  (`ClasseDeMaterial.contaContabilId`) e a do roteiro podem divergir; `conferirAlmoxarifadoContraRazao` acusa, o
  cadastro não impede.
- **Material e lote por busca no almoxarifado.** Bloqueio do depósito, requisição e contagem do inventário escolhem o
  material pelo catálogo `materiais-do-almoxarifado` (antes, `select` com os 1.000 primeiros). O lote da saída da
  requisição (`lotes-da-requisicao`, pelo item escolhido) e o da contagem (`lotes-do-inventario`, pelo material e
  pelo depósito do inventário) nasciam VAZIOS — a página não sabia o material —, e material controlado por lote não
  tinha como ser atendido pela tela.

## V37 — o roteiro do almoxarifado com versões

A família `ALMOXARIFADO` entrou em `VersaoDeRoteiro` (migration aditiva `20261109020000`, só ADD VALUE no enum). A
parametrização grava versão publicada; trocar as contas exige a marcação "Trocar as contas de um roteiro já cadastrado"
e vira versão nova, com autor, momento e motivo. O lançamento (`exigirRoteiro`) lê a versão publicada mais recente e,
sem versão, a linha antiga de `RoteiroAlmoxarifado`; o já lançado não muda. A proposta separada da publicação
(`proporVersaoDeRoteiro`) continua só para o patrimonial e o resultado da alienação. Teste `m10-roteiros` t-alm4
(N=2 trocas a partir da linha antiga), 3 mutações vermelhas.
