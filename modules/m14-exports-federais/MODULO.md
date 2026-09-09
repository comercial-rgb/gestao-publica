# M14 — exports federais (MSC: motor + resolver de dimensões)

Matriz de Saldos Contábeis para o SICONFI — TR 7.34, Portaria STN 642/2019, Regras Gerais
da MSC.

## Invariantes (NUNCA violar)

- **ZERO ESCRITA e ZERO ARITMÉTICA — e o `t7` roda o grep.** Nenhuma linha da matriz é
  materializada: a MSC é **derivada do razão** a cada geração. É isso que garante que o
  arquivo enviado à União possa ser **reproduzido amanhã, byte a byte**, por quem auditar.
  Uma tabela de "MSC enviada" seria a segunda verdade sobre o que o razão diz — e o dia em
  que divergisse, ninguém saberia qual das duas o TCE viu.
- **Toda soma vem do `somasPorConta` (M01, dono do razão).** Nada foi estendido: ele já
  respondia janela (`desde`/`ate`), `campoData` e filtro de natureza do lançamento.
- **O corte é a `dataTransacao`** — a data do FATO. Um lançamento de julho digitado em
  setembro pertence a **julho**. Por `criadoEm`, o mesmo mês teria valores diferentes
  conforme o dia em que o arquivo fosse gerado.
- **O ZIP é reprodutível**: data fixa (1980-01-01, o zero do formato), nunca `now`. O mesmo
  conteúdo tem de gerar os mesmos bytes.

## A `Natureza_Valor` é o sinal de (ΣD − ΣC) — e NÃO um Record de classe

O spec deste bloco mandava derivá-la do `CLASSE_PCASP`. **Isso estava errado**, por duas
razões, e as duas apareceriam no primeiro arquivo enviado:

1. O `CLASSE_PCASP` só conhece as classes **1 a 4** (o patrimonial). A MSC leva **também**
   o orçamentário e o controle (5 a 8) — metade do arquivo sairia sem natureza.
2. E, principalmente: **a natureza do VALOR não é a natureza da CONTA.** Uma conta de
   passivo *pode* ter saldo devedor. A MSC tem `Natureza_Valor` justamente para
   **representar** essa inversão, não para proibi-la. Derivá-la da classe faria o arquivo
   declarar "C" num saldo que é "D", e o balancete da STN não fecharia — sem que ninguém
   soubesse por quê.

O **saldo zero** é o único caso em que o sinal não decide. Aí vale a natureza **natural**
da conta (a coluna `naturezaSaldo`): a conta zerada é **publicada**, não omitida — é
justamente ela que a STN quer ver.

## As identidades rodam ANTES de o arquivo existir

| | O que amarra | Se quebra |
|---|---|---|
| **M1** | `beginning + period_change == ending`, **por conta** | o corte do período está errado (o fato do dia 1º contado dos dois lados) ou os recortes filtram lançamentos diferentes |
| **M2** | `Σ(D) == Σ(C)`, **por tipo de valor** | uma partida escapou do recorte — a MSC estaria declarando à STN que o município **criou dinheiro** |
| **M3** | o `beginning` da MSC de **encerramento** é o `ending` da **agregada de dezembro**, por conta | a União recebe um exercício que **começa onde o anterior não terminou** |

A **agregada** (mensal) **exclui** os lançamentos de `ENCERRAMENTO` — eles não são fatos
novos, só transferem o resultado; misturá-los faria dezembro parecer ter arrecadado o
resultado do ano inteiro. A de **encerramento** parte do saldo *sem* encerramento e o seu
`period_change` é **só** o encerramento. As duas juntas contam o ano, sem contar nada duas
vezes.

## Config semeada, nunca hardcode

`EnteConfig` (singleton) guarda o **código IBGE** e o **Poder/Órgão** — e o **nome de quem
conferiu**, com a data. Eles entram em **toda** linha do arquivo: um dígito errado o derruba
no validador da STN, ou o entrega em nome de outro ente. Um dado que vai para a União com o
nome do município tem de ter um humano por trás.

A IC **FP** vem do `indicadorSuperavit` — **a mesma fonte do Anexo 14**. Derivá-la de outro
lugar criaria uma segunda classificação do mesmo ativo, e o superávit financeiro publicado
nos dois relatórios diria coisas diferentes sobre o **mesmo dinheiro**, para dois órgãos de
controle diferentes. Ela só se aplica às classes **1 e 2**: "financeiro ou permanente" é
pergunta sobre saldo patrimonial, e exigi-la de uma VPD encheria o relatório de pendência
falsa — *a pendência que grita por tudo não denuncia nada.*

## A terceira via: a pendência NOMEADA

Conta sem indicador → a **linha sai** (sem a IC) e o **furo sai junto**, com nome e conta.
Não é erro silencioso nem abort:

- um export que **se recusa a existir** porque uma conta não tem indicador deixa o ente sem
  entregar **nada** — e o prazo não espera o plano de contas ficar bonito;
- um export que **omite a linha em silêncio** é pior: o balancete não fecha e ninguém sabe
  por quê.

Mesmo desenho do F2 do Anexo 14 e do fail-open do M03: **quem publica, avisa.** A
`IcExigidaPorConta` (a matriz do Anexo II) nasce **vazia** — o Anexo II é dado oficial e ele
não está no repositório; inventá-lo seria publicar uma exigência que ninguém escreveu.
Quando entrar (por INSERT, como os roteiros), cada IC exigida e não derivável vira pendência.

## Sem dependência nova — o ZIP é da stdlib

O SICONFI recebe a MSC **zipada**. O `node:zlib` faz DEFLATE, mas **não** faz ZIP: o `.zip`
é um **contêiner** (cabeçalho local + diretório central + CRC-32). Trazer uma lib de
terceiros — com o seu ciclo de CVE — para um sistema que envia dado fiscal à União, só para
escrever ~100 linhas de estrutura que a PKWARE publica há trinta anos, não se paga. O
`deflateRawSync` (stdlib) faz a compressão; o contêiner mínimo está em `msc/dominio.ts`.

---

# Bloco 2 — o RESOLVER de dimensões (ICs FR / NR / ND / FUNCIONAL)

**Zero coluna nova.** A `PartidaContabil` continua sem dimensão nenhuma além de `fichaId`.
A dimensão **já existe no FATO**, e o vínculo lançamento→fato é recuperável por consulta —
as relações 1-1 (`lancamentoId @unique` do M04/M05) e as 1-N (os movimentos do M07/M08/M10).
O `resolver.ts` **caminha** esse vínculo. Zero backfill, zero migração.

## Três desfechos — e confundir dois deles é o erro que este arquivo evita

| Desfecho | Quando | O que acontece |
|---|---|---|
| **RESOLVIDO** | o caminho chegou ao fato | a IC sai na linha |
| **SEM_DIMENSAO_POR_DESIGN** | o fato **não tem** dimensão, e isso está certo | a linha sai sem IC, e **não há pendência** |
| **NAO_RESOLVIDO** | o fato deveria ter, e o caminho não chegou | a linha sai sem IC, e **há pendência nomeada** |

Tratar a apuração do resultado como "pendência" encheria o relatório de falso-positivo — e
**a pendência que grita por tudo não denuncia nada.** Provado por mutação: desligando o
`SEM_DIMENSAO_POR_DESIGN`, o `t3` passa a acusar 3 pendências onde deve haver zero.

## O Record exaustivo é sobre a NATUREZA, não sobre o `origemTipo`

O `origemTipo` é uma **string livre**, e metade dos seus valores é montada em tempo de
execução (`${original.tipo}_ESTORNADO`, `PATRIMONIAL_${d.tipo}`). Um Record sobre ele seria
uma lista que envelheceria no dia seguinte, **sem o compilador avisar**.

A `NaturezaLancamento` (`NORMAL | ENCERRAMENTO`) **é** enum fechado, e é ela que separa os
dois mundos: o encerramento **transfere** o resultado, não cria fato — não tem fonte, nem
natureza de receita, nem função. `DIMENSAO_DA_NATUREZA` é o Record, e um valor novo **não
compila** sem classificação.

## A recusa: o resolver NÃO ESCOLHE

Um **pagamento com retenção** tem **dois** caminhos até a fonte: a coluna `Pagamento.fonteId`
e a conta bancária de cada `MovimentoExtraorcamentario` pendurado no **mesmo** lançamento
composto. Hoje eles concordam por construção (a retenção usa a conta do pagamento; a TR 5.23
exige que a fonte do pagamento seja a da conta).

Mas *"concordam por construção"* é uma frase que envelhece. A checagem roda **mesmo quando um
braço já respondeu** — o segundo caminho existe para **conferir** o primeiro. Se divergirem, o
resolver **recusa**, nomeando lançamento, fontes e caminhos: escolher seria mandar à União um
FR inventado, e **um FR errado num arquivo fiscal é dinheiro carimbado no lugar errado**.

## M4 — a dimensão não cria nem some dinheiro

Com as ICs, uma conta passa a ter **uma linha por combinação de dimensões** (o caixa
movimentado por uma receita **e** por uma despesa se parte em duas). Esse detalhe sai do grão
**fino** (`somasPorContaELancamento`, novo no M01 — *outro grão, a mesma aritmética*); o total
continua saindo do grão **grosso**. Somado de volta, o fino **tem** de reconstituir o grosso.

**O que a M4 pega, na prática:** a tentação de **omitir** a linha cujo lançamento não resolveu
(*"não sei a fonte, então não publico"*). Isso fura o balancete da conta — e a STN vê a
diferença antes de nós. A regra é a outra: **a linha sai sem a IC, e o furo vira pendência**.

## ⚠️ A ESCOLHA DECLARADA: um Anexo II que não temos

**Quais ICs cada conta leva é o Anexo II da MSC** — dado oficial que **não está no
repositório**. A `IcExigidaPorConta` é o interruptor:

- **vazia (hoje)** → o gerador emite **toda IC que conseguir derivar**. É o máximo de
  informação verdadeira que se pode dizer sem o Anexo II. **Isso é mais detalhe do que o
  leiaute pedirá**: uma conta de caixa movimentada por uma receita sai com NR, e o Anexo II
  provavelmente não a exige ali. A informação é **verdadeira** (aquele saldo veio daquela
  natureza), mas o grão é mais fino que o esperado — **o arquivo não deve ir à STN assim sem
  conferência**;
- **povoada** → ela **restringe**: a conta emite exatamente as ICs listadas, e os grupos
  **colapsam sozinhos**. Nada no código muda — é um INSERT, como os roteiros contábeis.

Inventar o Anexo II — decidir por conta própria que *"a conta de caixa leva FR mas não NR"* —
seria fabricar a norma.

## ⚠️ O código da IC FUNCIONAL é uma ESCOLHA, não um dado

Os fatos colados dizem *"FUNCIONAL (função/subfunção)"*, mas **não** trazem o código nem o
formato da IC no leiaute. Emitimos **função (2) + subfunção (3)** concatenados, tipo
`"FUNCIONAL"`. **Conferir contra o leiaute da STN antes do primeiro envio.**

## A pendência tem TAMANHO

Ela sai **por conta e por lançamento**. Saber que *"existe pendência de FR"* não serve de nada;
saber que ela vale 12 lançamentos numa conta e 4 noutra é o que faz alguém consertar o vínculo
— e o que permite decidir se o arquivo pode ir assim mesmo.

**Quem cai em NAO_RESOLVIDO hoje:** provisões matemáticas, entrada avulsa de bem, doação,
inscrição em dívida ativa e ajuste direto no razão. Todos são fatos que **não movimentam caixa**
— e é honesto que a fonte deles não exista. Se o Anexo II exigir FR nessas contas, a pendência
**é o pedido formal do vínculo**.

---

# PENDÊNCIAS NOMEADAS

## ~~⚠️ A dotação inicial NÃO gera lançamento contábil~~ ✅ CURADO

Descoberto ao calcular os literais do `t1`: o **crédito disponível** (6.2.2.1.1) é
**debitado** pelo empenho e **nunca foi creditado**, porque a dotação inicial da LOA vive
só no `MovimentoDotacao` (M05) e **não toca o razão**. Resultado: uma conta **credora com
saldo devedor**, permanente.

O balancete **fecha** (todo lançamento é balanceado, e a M2 passa), então nenhuma amarração
existente pegou. Mas o **subsistema orçamentário do razão não reflete a LOA** — e é
exatamente ele que o SICONFI espera ver povoado (classes 5 e 6). No PCASP, a dotação é um
lançamento (`D crédito a empenhar / C crédito disponível`).

**CURADO** no bloco da dotação (`RoteiroOrcamentario`): a LOA, os créditos adicionais e as
reservas passaram a lançar no razão, na MESMA transação do `MovimentoDotacao`. O crédito
disponível fecha **credor** (100.000 − 6.000 = 94.000 no t1 da MSC), e a conta
credora-devedora sumiu. A amarração **A1-orc** (razão × movimentos de dotação) é a que
enxerga esta classe de furo — e ela não existia: o balancete fecha por lançamento, um a um,
e por isso deixou a metade do orçamento faltar no razão sem reclamar.

⚠️ A **representação** da inversão continua sendo o ponto do `Natureza_Valor` — e continua
testada (t4): um lançamento direto que deixa o passivo com saldo devedor sai como **D**. A
MSC não maquia; ela representa.

## ~~(c) DIMENSIONAMENTO — a fonte de recurso (IC "FR") na partida~~ ✅ IMPLEMENTADO

O dimensionamento virou o `resolver.ts` (acima). A recomendação — **zero coluna** — foi
seguida à risca. O censo continua aqui como arqueologia da decisão.

**O estado.** `PartidaContabil` carrega `fichaId` (nullable) e **nada mais** de dimensão. Os
lançamentos nascem em **25 pontos**, em 11 arquivos: `m01` (genérico), `m04` (arrecadação),
`m05` (empenho/liquidação/pagamento), `m07` (extraorçamentário), `m08` (apuração e restos),
`m10` (almoxarifado, dívida, dívida ativa, patrimônio, provisões).

**A tentação — e por que ela é cara.** Uma coluna `fonteId` na partida exige tocar os 25
pontos **e** um backfill: sem ele, todo lançamento anterior fica com `null`, e um `null` de
fonte é indistinguível de "fonte que ninguém preencheu".

**A alternativa por FATOS, e ela parece melhor.** A fonte **já existe** em todo fato que
gera lançamento, e o vínculo é 1-1 (`lancamentoId @unique`):

| Fato | Onde a fonte está |
|---|---|
| `ReceitaArrecadada` | `fonteId` (coluna própria) |
| `Empenho` / `Liquidacao` | `empenho.ficha.fonteId` |
| `Pagamento` | `fonteId` (e o guard de `b05ce06` garante que é a da ficha) |
| `MovimentoExtraorcamentario` | `contaBancaria.fonteId` |
| Movimentos do M10 | herdam da liquidação / da receita que os originou |
| **Apuração / encerramento** | **nenhuma — e é correto**: transferir resultado não tem fonte |

Ou seja: um **resolver de leitura** (`lancamentoId → fonte`, pelo `origemTipo`/`origemId` ou
pelas relações 1-1) responde o FR **sem migração e sem backfill**, e **fail-closed** nos
lançamentos que legitimamente não têm fonte. É o mesmo padrão do `superavitPorFonte` (M12),
que já soma por fonte **pelos fatos** justamente porque *"o razão não tem fonte"*.

**Ressalva honesta:** o resolver assume **uma fonte por lançamento**. Isso vale hoje (cada
fato tem uma fonte só, inclusive o pagamento com retenção — a retenção sai do mesmo caixa).
Se algum dia um lançamento cruzar fontes, o resolver **tem de recusar**, não escolher.

**Recomendação para o Momento A:** resolver por fatos, **zero coluna**. Reavaliar se — e só
se — aparecer um lançamento multi-fonte.

# Bloco 3 — a VIRADA e a IC "AI" (ano de inscrição do RP)

## ~~⚠️ O `beginning_balance` de janeiro descartava o encerramento~~ ✅ CURADO

**Era um bug do MOTOR, e ele valia um exercício inteiro.** O recorte da MSC agregada excluía
os lançamentos de `ENCERRAMENTO` **sem recorte de tempo** — isto é, os de *todos* os anos,
para sempre. Consequência: o `beginning_balance` de **janeiro de E+1** (que é "tudo até
31/12/E") jogava fora o encerramento de E. O ano novo abria com a receita do ano morto
ressuscitada, o resultado apurado ausente do patrimônio líquido e — depois que o M08 passou a
enterrar as 5/6 — a dotação caducada de volta no orçamento novo.

**Nenhuma identidade pegava**, e a razão é instrutiva: a **M3** compara a agregada de dezembro
com a de encerramento *do mesmo ano* — e os dois lados erravam **igual**. Uma identidade que
só olha para dentro do exercício não enxerga um furo na costura entre exercícios. E a suíte
não pegava porque **só existia um exercício nela**.

A regra certa não é *"excluir o ENCERRAMENTO"*, é **"excluir o encerramento **do exercício da
competência**"** — o de um ano anterior não é fato pendente de nada: ele **já é saldo**. O
corte virou `excluirDesde` (M01, `FiltroDeNatureza`): *"o encerramento que ainda não aconteceu
para este recorte sai; o que já é história fica"*.

⚠️ **Não mudou um literal de 2026**: dentro de um exercício, o encerramento (31/12) já cai
fora de todo recorte anterior a dezembro **por data**. O corte só aparece quando o segundo
exercício existe.

## M5 — a costura entre os ANOS

`beginning(agregada de janeiro de E+1) == ending(MSC de encerramento de E)`, por conta.

A M3 costura as duas matrizes **de um mesmo ano**; a M5 costura os **anos**. Ela é a
identidade que o bug acima teria acusado — e é ela que exige que o exercício novo comece
**exatamente** onde o anterior terminou: depois de apurado o resultado **e** enterrado o
orçamento.

## A IC "AI" — e ela custou ZERO coluna

**AI = Ano de Inscrição de Restos a Pagar.** ✅ **CONFIRMADO NA FONTE.**

> **Cartilha da MSC (STN):** *"identificar o ano de inscrição dos valores referentes a restos a
> pagar, representada pelo tipo **AI** e associada às **contas de controle da inscrição em
> restos a pagar**."*

⚠️ **Uma versão anterior deste arquivo glosava AI como *"ativo/passivo interno-externo"*. Aquilo
estava ERRADO e foi removido** — não é sinônimo, não é leitura alternativa, é outra coisa. Se
você encontrar essa leitura em algum lugar (num comentário, num commit antigo, na sua memória),
ela é a errada. A fonte é a Cartilha, citada acima.

⚠️ **E a citação diz mais do que o nome da sigla.** Ela associa a AI às **contas de controle da
inscrição em RP** — as 5.3/6.3. Este sistema **ainda não as tem** (a inscrição de RP não gera
lançamento — ver abaixo e o M08), então a AI sai hoje nas contas que os **movimentos** de RP
tocam. Quando o roteiro de inscrição existir, ela passará a sair também onde a Cartilha a
espera. A implementação está certa para o razão que existe; o alvo final está nomeado.

A pergunta que a STN faz é *"esse saldo de RP é de
que exercício?"*, e a resposta já estava no banco desde o M08:
`InscricaoRestosAPagar.exercicioOrigem`. O resolver caminha o vínculo que **já existia** para a
fonte (`movimentosRestos -> inscricao`) e lê mais um campo. Nenhuma coluna, nenhum backfill,
nenhuma migração — o mesmo padrão do bloco 2.

⚠️ **Uma coluna `anoInscricao` na partida seria a segunda verdade sobre o mesmo ano** — e o dia
em que ela divergisse, o RP de 2025 iria à União carimbado como 2026.

### A AI só existe onde o RP se MOVE — e isso é a verdade, não uma limitação

**A inscrição de RP não tem lançamento contábil.** O `encerrarExercicioComRestos` grava só a
linha em `InscricaoRestosAPagar` — o RP tem razão próprio (`MovimentoRestosAPagar`), por
desenho do M08. Logo não há lançamento de inscrição para carimbar, e a AI aparece quando o RP
é **liquidado, pago ou cancelado**. É toda a verdade que o sistema tem.

### A AI se SOMA aos outros braços — ela não disputa com eles

O pagamento de um RP grava um `Pagamento` (para a ordem cronológica e a conciliação), então o
braço do **M05** já respondeu quando o do M08 roda. Se a AI seguisse o padrão
`if (fato === null)` dos outros braços, ela seria descartada em **todo** pagamento de RP — ou
seja, no único lugar onde ela existe. Ela é carimbada **depois** de todos os braços, e tem a
sua própria **recusa**: um lançamento que baixa inscrições de exercícios **diferentes** não tem
um ano — o resolver **para**, nomeando os anos.

### ⚠️ A POSIÇÃO da AI no leiaute é uma ESCOLHA declarada

O **significado** da sigla está confirmado (Cartilha, acima). A **posição** dela nos pares
TIPO/IC, não: ela entrou como **7º par** (`tipo_ic7`/`ic7`), no fim — o que menos arrisca,
porque preserva a posição de todas as outras. **O Anexo II não está no repositório** (mesma
pendência da FUNCIONAL): **CONFERIR contra o leiaute da STN antes do primeiro envio.**

## Fora de escopo aqui

- A IC **CO** (código de operação) — segue sem caminho até um fato.
- A tabela do **Anexo II** (a `IcExigidaPorConta` existe e está vazia — ver a escolha declarada).
- **DCA / RREO / RGF** e o envio (autenticação, protocolo, recibo).

---

# ⚠️ PENDÊNCIA 7.35 — DIRF: a obrigação FOI EXTINTA. Decisão estratégica pendente.

**Dono da decisão: Winner.** Não é uma pendência técnica — é uma escolha sobre *o que o produto
deve entregar*, e o código não a toma sozinho.

## O fato

A **DIRF foi extinta para fatos geradores a partir de 01/01/2025.**

- **IN RFB 2.096/2022** — extingue a DIRF e define a substituição.
- **IN RFB 2.181/2024** — prorroga/consolida o cronograma.
- **Substituição:** **eSocial** (evento **S-1210**) e **EFD-Reinf** (série **R-4000**).

Ou seja: o requisito **7.35 do TR pede um artefato que a Receita Federal não recebe mais** para
os fatos geradores do exercício corrente.

## A decisão a tomar (e as opções)

| opção | o que significa | quando faz sentido |
|---|---|---|
| **Atender via 7.38** | tratar a retenção/informação de rendimentos pelo caminho do eSocial/EFD-Reinf, e considerar o 7.35 satisfeito por equivalência | se o TCE/contratante aceitar a substituição legal como cumprimento |
| **Export legado** | implementar a DIRF assim mesmo, como export histórico | se houver **fatos geradores até 31/12/2024** a declarar, ou se o contrato exigir a letra do TR |

⚠️ **As duas podem ser necessárias ao mesmo tempo**: a obrigação morreu *para a frente*, não
*para trás*. Um ente com pendência de exercícios anteriores ainda pode precisar do export
legado — e isso é uma questão de FATO (existem fatos geradores ≤ 2024 no escopo?), não de
opinião.

**Enquanto a decisão não vier, nada é implementado.** Inventar um dos dois caminhos "no embalo"
seria construir um export fiscal para uma obrigação que talvez não exista — o oposto do que este
repositório faz com dado que vai a órgão de controle.

## SEFIP — mesma pendência, e o status ainda NÃO foi verificado

A **SEFIP/GFIP** está na mesma prateleira: substituída pelo eSocial/DCTFWeb no mesmo movimento
regulatório. ⚠️ **Mas o status exato dela NÃO foi conferido neste bloco** — e este parágrafo
existe para não deixar isso passar como se tivesse sido. **A verificação é uma tarefa aberta**,
e ela precede qualquer decisão sobre implementá-la.

---

# MANAD — TR 7.36 (IN MPS/SRP 12/2006, leiaute v1.0.0.2)

`COD_VER = 003`. Leiaute mantido pela v1.0.0.3 / ADE Cofis 44/2020. Blocos **0 + L + 9**
completos; **K** só a abertura; **I** não se aplica (é escrituração de PJ de Direito
Privado — um município não o tem, nem vazio).

## O MANAD é o OPOSTO da MSC, campo a campo

Os dois arquivos saem do **mesmo razão**, para **dois órgãos**, e quase tudo que é verdade
num é erro no outro:

| | MSC (SICONFI/STN) | MANAD (RFB/AFPS) |
|---|---|---|
| codificação | UTF-8 | **ISO 8859-1** |
| decimal | ponto `1129989.99` | **vírgula** `1129989,99` |
| separador | vírgula (CSV) | **pipe** `\|` |
| campo vazio | `,,` | `\|\|` |

Por isso a conversão mora **na borda, e só nela**. Dentro do sistema dinheiro é `Money` e
serializa com ponto — o formato de máquina. Quem "consertar" o `toMoney` para vírgula
quebra a MSC. Os dois formatos coexistem porque **nenhum vaza do seu serializador**.

`serializarManad` devolve **`Buffer`**, não `string` — de propósito: o instante em que uma
string vira bytes é o instante em que a codificação acontece, e um `writeFile` com o
default do Node (UTF-8) poria "ç" em dois bytes. Ao devolver bytes já em Latin-1, **não
existe caminho em que o chamador erre a codificação**.

## Latin-1: fail-closed, e NUNCA transliteração

Caractere fora do ISO 8859-1 (emoji, travessão `—`, aspas curvas) **derruba a geração**,
nomeando o caractere, o ponto de código, o registro e o campo. Não se translitera:

- **"ç" e "ã" CABEM em Latin-1** — trocá-los destruiria acentuação *válida*, e o nome do
  credor iria à Receita deformado;
- o que **não** cabe é sinal de **dado sujo** (texto colado de editor rico). Um arquivo
  fiscal não conserta dado sujo — ele o **denuncia**.

## As identidades

- **N1** — toda contagem (`0990`/`K990`/`L990`/`9990`/`9999`/`9900`) é derivada das linhas
  **realmente emitidas**. O teste as confere por uma **segunda contagem independente**.
- **N2 (COMPOSTA)** — `Σ L050 (D − C)` por ficha `==` empenhadoLíquido(**M05**) −
  canceladosRP(**M08**). Os dois lados são o mesmo número por **caminhos independentes**: o
  esquerdo lê as linhas *que vão no arquivo*; o direito vem dos **donos**. É a identidade que
  pega o **drift do gerador** — um arquivo pode estar perfeitamente bem-formado e **mentindo**.
- **N2-RP** — para o RP carregado (orientação (b)): o `D` do arquivo `==` valor original do
  `Empenho` (M05), e `Σ C` `==` cancelado do M08 no corte. A N2 principal é por ficha do
  exercício **corrente**, e a ficha de um RP é de **outro ano** — sem estas duas, o RP
  carregado seria a única parte do arquivo **sem confrontação**, justamente a que atravessa
  exercícios e onde o erro é mais caro.
- **N3** — `L250.VL_EMPENHADO == Σ L050` da ficha. O cruzamento **intra-arquivo**: o
  balancete e o detalhe são duas vistas do mesmo fato, e a Receita as confronta.

### ⚠️ O `IND_DEB_CRED` é RECURSIVO — e a N2 é quem pegou isso

A leitura ingênua ("tem `estornoDeId`? é C") **quebra num caso real**: o **estorno de uma
anulação parcial** (TR 5.35) *restaura* o empenho — ele é economicamente um **D**.

```
empenho E = 6.000          -> D 6.000
anulação parcial P = 1.000 -> C 1.000
estorno de P               -> D 1.000   (DESFAZ a redução)
```

O sinal de um estorno é o **oposto do sinal do que ele estorna**, e por isso `sinalDoFato`
caminha a cadeia. É a mesma semântica do `somaLiquidaEstornaveis` — e é *por serem a mesma
semântica por dois caminhos* que a N2 pode confrontá-los.

## Decisões declaradas (passo 0)

- **(a) `NM_EMP`/`NM_LIQUID`/`NM_PGTO` saem COMPOSTOS** (`NE-1/2026.1`), idênticos nos três
  registros. O `numero` do repositório é único **por ficha**, não no ente — duas fichas
  podem ter, ambas, o "NE-1", e o MANAD usa o `NM_EMP` como a chave que costura L050→L100→
  L150. **Pendência:** o certo seria numeração institucional sequencial (`2026NE00001`); o
  repositório não a tem. Quando existir, a composição vira identidade e nada mais muda.
- **A anulação carrega o `NM_EMP` do empenho que ela anula** — é isso que faz o `D` e o `C`
  se encontrarem. E o `COD_CREDOR` dela vem da **raiz**: a linha de anulação parcial do M05
  grava o **sentinela** `"ANULACAO_PARCIAL"` no `credorCpfCnpj`, e copiá-lo poria essa
  string no arquivo da Receita.
- **(b) `CTA_DEBITO`/`CTA_CREDITO` = o par PATRIMONIAL** (D fornecedor × C caixa) — o
  balancete de verificação é patrimonial; as contas de controle (5/6) não estão nele. **Mais
  de um candidato ⇒ fail-closed nomeando**: um pagamento *com retenção* tem duas pernas
  credoras patrimoniais (caixa pelo líquido, consignação pelo retido) e aí **não existe "a"
  conta a crédito**. O gerador não escolhe — mesma postura do resolver da MSC com fonte
  ambígua.
- **As contas saem sem os pontos.** `CTA_*` são campos numéricos; o ponto do PCASP é
  apresentação. Conversão de borda, como a vírgula.
- **`COD_SUBPROGR` e o bloco `L600` saem VAZIOS/ZERADOS** — a Portaria STN 42/1999
  **extinguiu** o subprograma. É o caso literal do item 3.1.9.
- **Escopo = o EXERCÍCIO** (o que `COD_FIN=62` significa). Janela sub-anual **não é
  suportada**: um empenho de fevereiro anulado em março entraria como um `C` sem o seu `D`,
  e a N2 deixaria de fazer sentido. Ou o recorte é o exercício, ou a identidade morre.
- **O 9900 é um ponto fixo** e conta a si mesmo (convenção do SPED; leitura literal de "1
  por tipo presente"). Se o validador esperar o 9900 totalizando só os blocos 0/K/L, é
  ajuste de uma linha, isolado no `bloco9`.
- **Linha com último campo vazio TERMINA EM PIPE, e isso é correto.** "Sem pipe ao fim"
  proíbe o *delimitador a mais* — não o campo vazio final. Aparar aquele pipe **apagaria um
  campo**. A invariante testável é a **contagem de campos**.
- **`TIP_UN_ORC` mora na UNIDADE, não no `EnteConfig`.** O leiaute o põe no L400, e com
  razão: um ente tem Prefeitura (01), Sec. Educação (03), Saúde (04) e RPPS (05) como
  unidades *diferentes*. Um parâmetro no ente carimbaria "01" em todas — e é exatamente
  este campo que a Receita usa para saber **onde procurar a retenção previdenciária**.

## Pendências NOMEADAS (o arquivo sai; o furo sai junto)

- ~~**`L800` (obras) sai VAZIO**~~ ✅ **CURADO** — ver a seção "Obras" abaixo.
- ~~**`CANCELAMENTO` de RP não tem registro**~~ ✅ **CURADO** — ver abaixo.
- **`L750`: `NOM_FORNECEDOR` vazio para credor sem contrato.** O nome do credor só existe
  dentro do `Contrato` (M11) — um empenho de diária, folha ou sentença não tem contrato. O
  endereço/cidade/UF/CEP saem vazios **sempre**. Se a Receita exigir, é **cadastro de
  credores novo** — não é derivável.
- **`L250`:** `VL_AT_MONETARIA`, `VL_SUP_REC_VINC`, `VL_RED_REC_VINC` e `VL_LMTDO_LRF`
  (contingenciamento do art. 9º da LRF) saem vazios — não são fato no repositório.
- **Bloco K (folha)** depende do TR 7.10, inexistente.

---

# ✅ CURADO — cancelamento de RP no L050, e o L800 (obras)

## O cancelamento de RP é um `C` no L050 — e a N2 virou COMPOSTA

O manual é literal: o `IND_DEB_CRED` do L050 é *"D-empenho originário e crédito adicional /
**C-anulação, cancelamento**"*. Ele **nomeia** o cancelamento. Em `cae5f45` ele ficou de fora
por um motivo real: emiti-lo **quebraria a N2**, porque um cancelamento de RP **não é um
`Empenho`** — é um `MovimentoRestosAPagar`, e o `somaLiquidaEstornaveis` do M05 não o vê.

**A cura não foi afrouxar a identidade: foi COMPÔ-LA.** O lado direito passou a buscar o
cancelado no seu dono (o M08). A identidade ficou **mais forte, não menos** — agora ela amarra
**dois módulos** em vez de um.

### ⚠️ Correção ao que `cae5f45` afirmou: a data do fato SEMPRE existiu

Aquele commit disse que *"o `MovimentoRestosAPagar` não tem data própria — só `criadoEm`"*. A
primeira metade é verdade (não há **coluna** de data), mas a **conclusão estava errada**: o
`cancelarRestosAPagar` **recebe `data`** e a grava na `dataTransacao` do lançamento (1-1). A
data do FATO é recuperável — é o **mesmo caminho** que já dava o `HIST_LIQUID`. **Zero coluna,
zero migração.**

E é **fail-closed**: se um cancelamento não tiver lançamento (a FK é nullable), a geração
**cai**. Não se chuta o `criadoEm` — seria pôr o cancelamento no exercício errado, que é
exatamente o furo que este bloco veio fechar.

- O `NM_EMP` do `C` é o **da raiz**: o cancelamento não é um empenho novo, ele **reduz** o de
  origem. A Receita soma o D contra o C **por NM_EMP**.
- Um cancelamento **estornado não sai**: o `ESTORNO_CANCELAMENTO` devolve o saldo — a obrigação
  voltou a existir, e declarar a extinção seria mentir. (O cancelado *líquido* do M08, que a
  N2-RP confronta, já o desconta — e é por isso que os dois lados batem.)

## Obras — TR 4.50, e o L800 saiu do vazio

**Casa: M11.** O precedente manda — o cadastro que o `Empenho` referencia mora no módulo dono
do conceito (`ClasseDeBens`/`DividaConsolidada` no M10, `Contrato` aqui). Uma obra é **objeto
de contrato**. O **guard** fica no M05 (`empenhar`), como o 4.48 e o 4.49, porque é ele que lê
a natureza da ficha.

### O gatilho é um Record FECHADO — e a armadilha está no rol oficial

`ELEMENTOS_DE_OBRA` nasce `{51}` ("Obras e Instalações", literal do seed).

⚠️⚠️ **O elemento 37 chama-se "Locação de Mão-de-Obra".** Tem "Obra" no nome e **não é obra
nenhuma** — é locação de **pessoal**. Qualquer derivação por texto (`nome.includes("Obra")`) o
pegaria, e **todo empenho de mão de obra passaria a exigir uma matrícula CEI que não existe**.
O rol oficial diz que o elemento *existe*; só o Record diz se ele é **obra**. (Mesmo desenho do
`ELEMENTOS_DE_ALMOXARIFADO`, que nasceu `{30}` e deixou o 32 de fora pelo mesmo motivo.)

Candidatos **listados e não incluídos**: **52** (bem móvel — território do `ClasseDeBens`) e
**39** (é onde caem os *serviços sujeitos à retenção sem obra*, o tipo 01 avulso — **pendência
nomeada**: precisa de rol próprio/ASTEC).

### O guard é UNIDIRECIONAL — a diferença deliberada para o 4.48

| | elemento 51 | outro elemento |
|---|---|---|
| **sem obra** | **REJEITA** (TR 4.50) | passa |
| **com obra** | passa | **PERMITIDO** |

O 4.48 é **bicondicional** (dívida fora do grupo 6 é vínculo sem sentido). Aqui **não**: a
instalação elétrica de uma escola pode vir, legitimamente, no elemento 39, e o ente tem todo o
direito de rastreá-la na obra. **Proibir o vínculo voluntário obrigaria quem quer rastrear a
MENTIR na classificação da despesa.** Um vínculo a mais não corrompe soma nenhuma; um vínculo a
menos deixa a obra **invisível para a Receita**.

A anulação (total **e** parcial) **copia** o `obraId` — como copia o `contratoId`, e pelo mesmo
motivo: sem isso, a soma por obra veria o empenho e **não veria a redução dele**.

### O CEI é nullable — e isso é uma decisão, não um descuido

Uma obra existe **antes** da matrícula (o CEI se abre na Receita, e isso leva dias). Exigi-lo no
cadastro obrigaria o ente a **INVENTAR um CEI** para conseguir empenhar — e **um CEI inventado
num arquivo da Receita é infinitamente pior do que um campo vazio**, que ao menos é honesto.

Vazio, ele sai como `||` (item 3.1.9), a **linha SAI mesmo assim**, e vira **pendência viva** com
o nome da obra. É a "terceira via" do M14: quem publica, avisa.

## Pendência que fica

- **Serviços sujeitos à retenção SEM obra** (o tipo **01** do rol, avulso — tipicamente no
  elemento 39). Eles precisam de um **rol próprio (ASTEC)** e de um gatilho que não é o elemento
  51. É território de M15 — **não é escopo deste bloco**, e o L800 não os cobre.
