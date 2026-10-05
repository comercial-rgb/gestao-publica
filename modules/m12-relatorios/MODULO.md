# M12 — relatórios

**Lei 4.320/64 (anexos), MCASP; Lei 14.133/2021, art. 141, §3º.** Anexo 12 (Balanço
Orçamentário), Anexo 13 (Balanço Financeiro), relatório de Restos a Pagar, dataset
mensal da ordem cronológica, **Anexo 14 (Balanço Patrimonial)** e **Anexo 15 (DVP)**.

## A NATUREZA DO MÓDULO: ZERO ESCRITA NO RELATÓRIO

**Nenhum relatório grava.** Relatório é FUNÇÃO dos fatos — se um deles precisar
gravar, o desenho está errado. O grep de escrita nos arquivos de relatório dá
ZERO, e é assim que se confere.

### A correção de doutrina (Anexo 14)

Este manifesto dizia **"ZERO tabela"**. Não diz mais — e a diferença importa.

Os Anexos 14 e 15 precisam saber que "Caixa e Equivalentes" é a conta `1.1.1`. Esse
mapeamento **é dado do ente, não do programa**: escrevê-lo no código seria inventar
plano de contas, e no dia em que o PCASP real chegasse, seria reescrever o
relatório. Então ele é TABELA (`LinhaDemonstrativo` + `PrefixoDaLinha`), cadastrada
por `cadastro-linhas.ts`.

**Isso não é o relatório escrevendo.** É PARAMETRIZAÇÃO — exatamente o que o
`RoteiroPatrimonial` é para o M10: o "roteiro contábil" dos anexos. Quem grava é o
serviço de CADASTRO; os relatórios continuam sendo leitura pura.

A regra correta, então, é: **zero escrita no relatório; o mapeamento é cadastro.**

### E o que continua sendo CÓDIGO

A **estrutura** do PCASP — a natureza de saldo de cada classe (1 devedora, 2
credora, 3 devedora, 4 credora) — **não é escolha do ente**: é o MCASP, e vale para
todo ente do país. Ela vive em `CLASSE_PCASP` (M01), Record exaustivo. O PLANO é
dado; a ESTRUTURA é código.

## Invariantes do eixo (valem para os três blocos)

1. **A VERDADE É O SUM.** Todo número sai de `SELECT SUM` sobre os movimentos
   append-only. **É PROIBIDO ler coluna cache** — `saldoAutorizado`,
   `saldoDisponivel`, `saldoEmpenhado`, nenhuma. O projeto inteiro é construído
   sobre "a coluna é derivada, o movimento é a verdade"; ler o cache **aqui**, no
   documento que vai para o TCE, inverteria o invariante: o cache viraria a
   verdade. (Grep de conferência: nenhuma ocorrência de `saldo*` do M05 neste
   módulo.)
2. **O layout não se inventa.** Linhas, notas (I…XV) e fórmulas vêm do esqueleto
   oficial. O que o layout não especificou está em **PENDÊNCIAS**, não preenchido
   de memória.
3. **Dinheiro é `Decimal` e serializa como string `"1234.56"`.** Nunca `number` —
   float no relatório oficial é o mesmo pecado do float no banco. Ponto único de
   serialização: `serializar()`.
4. **Fail-closed.** Exercício inexistente = erro. Sinal indefinido = erro.
   Balanço que não fecha = erro.

## Anexo 12 — os quatro quadros

| Quadro | Linhas | Colunas |
| --- | --- | --- |
| 1 — Receitas | categorias (I, II) + origens; intra só se houver dado | previsão inicial (a), atualizada (b), realizadas (c), saldo (d = c − b) |
| 2 — Despesas | categorias (VIII, IX) + grupos; reserva (X) só se houver | dotação inicial (e), créditos (f), atualizada (g = e+f), empenhadas (h), liquidadas (i), pagas (j), saldo (k = g − h) |
| 3 — RP não processados | por categoria econômica | inscritos ant., inscritos 31/12, liquidados, pagos, cancelados, saldo |
| 4 — RP processados | por categoria econômica | inscritos ant., inscritos 31/12, pagos, cancelados, saldo |

**As linhas analíticas SAEM DO BANCO:** origem = 2º dígito do código da natureza
da receita; grupo = 2º dígito da natureza da despesa. Nada é hard-coded.

### A linha de equilíbrio

**Resultado orçamentário = receita realizada − despesa EMPENHADA** (não paga: é o
empenho que compromete o crédito). Negativo → **DÉFICIT (VI)**, na coluna
*realizadas* da receita. Positivo → **SUPERÁVIT (XIV)**, na coluna *empenhadas* da
despesa. Por construção `TOTAL receitas (VII) == TOTAL despesas (XV)` — e
`montarBalancoOrcamentario` **CONFERE** isso antes de devolver: se não fechar, o
Anexo 12 não sai.

## ⚠️ AS DUAS ARMADILHAS DESTE RELATÓRIO

### 1. A coluna "PAGAS" é o BRUTO

Um pagamento com retenção na fonte (M07) sai do caixa pelo **líquido**, mas a
**despesa executada é o bruto**: o município deve, e paga, o valor cheio — parte em
dinheiro ao credor, parte ao consignatário. Publicar o líquido aqui
**subdeclararia a execução da despesa**.

O líquido que saiu do caixa é assunto do **Anexo 13** (bloco 2), onde a retenção
aparece do outro lado, como ingresso extraorçamentário. **É a mesma retenção,
contada uma vez em cada demonstrativo — e é isso que faz os dois fecharem.**

Testado: o cenário de ouro paga 6.000 retendo 500; a coluna `pagas` é `"6000.00"`,
e o teste confere que a perna de caixa do lançamento é `"5500.00"` — provando que
a retenção existe e que o quadro **não** a usou.

### 2. O CORTE TEMPORAL

A despesa executada de um exercício é o que foi empenhado/liquidado/pago **até o
encerramento dele**. Um pagamento de RP feito em 2027 quita um empenho cuja ficha é
de **2026**: sem o corte, ele entraria na coluna `pagas` de 2026 **e** no quadro de
RP — **o mesmo dinheiro, duas vezes**.

- Janela do exercício N: `(encerramento de N−1, encerramento de N]`.
- Exercício **ABERTO**: sem limite superior, e `parcial: true` na estrutura.
- Os RP que o exercício N **executa** são os inscritos em 31/12 de N−1 (ou antes).
  Os inscritos no encerramento de N aparecem no balanço de **N+1**.

Testado: o balanço de 2026 mostra `pagas = 6000.00` (não 7.000, que incluiria o RP
pago em 2027), e os quadros de RP de 2026 estão zerados.

## Anexo 13 — Balanço Financeiro (bloco 2)

Quadro único, duas seções que se igualam. **O Anexo 12 conta a execução do
ORÇAMENTO; o Anexo 13 conta o CAIXA.** São perguntas diferentes — e é por isso que
os dois usam números diferentes para o MESMO fato.

| INGRESSOS | DISPÊNDIOS |
| --- | --- |
| Receitas orçamentárias (arrecadadas, por fonte) | Despesas orçamentárias (**EMPENHADAS**, por fonte) |
| Transferências recebidas (0 hoje) | Transferências concedidas (0 hoje) |
| Inscrição de RP não processados + processados | Pagamento de RP não processados + processados |
| Depósitos restituíveis (M07: ingressos) | Depósitos restituíveis (M07: dispêndios) |
| Saldo em espécie do exercício **anterior** | Saldo em espécie para o exercício **seguinte** |

### A identidade que faz tudo fechar

```
empenhado = pago em caixa + retido + inscrito em restos a pagar
   9.000   =     5.500     +   500  +        3.000
```

- **Despesa pela EMPENHADA, não pela paga.** O que foi empenhado e **não saiu do
  caixa** está do outro lado, como **inscrição de RP** (ingresso extraorçamentário:
  a obrigação existe, o dinheiro ficou).
- **A RETENÇÃO É A PONTE ENTRE OS DOIS ANEXOS.** Os mesmos 500 de INSS aparecem
  **uma vez em cada demonstrativo, com sinais opostos**: no Anexo 12 dentro da
  despesa paga (6.000, o bruto); no Anexo 13 como **ingresso** de depósito
  restituível (o dinheiro do INSS ficou no caixa do ente). Se o Anexo 12
  publicasse o líquido, **ou** se o Anexo 13 esquecesse o ingresso, a identidade
  acima quebraria.

### A conferência contra o caixa (o que dá sentido ao resto)

`saldoSeguinte = saldoAnterior + ingressos − dispêndios` fecha **por construção** —
e por isso **não prova nada**: qualquer conta fecha se a última linha for "o que
falta". A prova é bater contra o **caixa REAL do razão** — o somatório das partidas
nas contas de disponibilidade (ΣD − ΣC). O serviço **CONFERE e LANÇA se divergir**:

> Ou falta um fluxo no demonstrativo, ou há lançamento em conta de caixa que nenhum
> fluxo explica. Nos dois casos, o Anexo 13 **não sai**.

**Verificado por mutação:** removendo o ingresso da retenção do montador, o balanço
para com `diferença de -500.00` — exatamente o valor retido.

### As contas de caixa vêm por PARÂMETRO

`balancoFinanceiro(prisma, exercicio, contasDisponibilidade)`. Não existe flag
`ehDisponibilidade` no PCASP, e o projeto não tem conta mágica no código — os
roteiros contábeis sempre receberam os códigos de quem chama. Aqui é igual.
Fail-closed: rol vazio ou conta inexistente = erro.

## Relatório de Restos a Pagar (bloco 3a)

`relatorioRestosAPagar(exercicioReferencia)` — uma linha por **inscrição**,
agrupada por `(exercício de origem, tipo)`, com empenho e credor.

| Coluna | O que é |
| --- | --- |
| inscrito | `valorInscrito` (retrato do encerramento) |
| liquidadoAposInscricao | só **NP** — a parte que virou obrigação depois da virada |
| pago / estornosDePagamento | **BRUTOS**, separados |
| cancelado / estornosDeCancelamento | **BRUTOS**, separados |
| saldo | `inscrito − pagoLíquido − canceladoLíquido` |

**AS COLUNAS DE ESTORNO EXISTEM PARA SEREM VISTAS.** Um relatório que mostrasse só
o líquido esconderia que houve um pagamento **e** uma anulação — e é exatamente
isso que o controle externo precisa enxergar. O teste de ouro tem pagamento
estornado e cancelamento estornado, com valor real nas colunas: uma coluna de
estorno que só sabe mostrar zero não prova nada.

### ⚠️ A ARITMÉTICA NÃO É DAQUI

Os totais saem de **`totaisDosMovimentos` (M08)** — a MESMA função que o M08 usa
para decidir se um pagamento de RP cabe no saldo. O relatório e a regra de negócio
contam a mesma história **porque somam com o mesmo código**. Uma cópia da
aritmética aqui, com um sinal trocado, é o bug do `345af7d` renascendo — agora num
documento que vai para o TCE.

O bloco 3 **extraiu para o domínio do M08** (`totaisDosMovimentos`,
`somaLiquidaEstornaveis`) o que estava enterrado no `restos.ts`. O M08 lê os
movimentos e chama; o M12 lê os movimentos **até a data de corte** e chama a mesma
função. **A aritmética é uma só; o recorte é de quem lê.**

**Amarração auto-executável:** `Σ saldos das linhas == Σinscrito − Σbaixas
líquidas`. As duas contas percorrem os mesmos números por caminhos diferentes; se
divergirem, há erro de montagem e o relatório **não sai**. Sem isso, um totalizador
que esquecesse um grupo fecharia consigo mesmo.

## Ordem cronológica mensal — §3º (bloco 3b)

`ordemCronologicaMensal(ano, mes)` — o dataset que o art. 141, §3º manda publicar
todo mês. A UI/portal é o **M13**.

- **A fila do mês é a fila DAQUELE mês.** Publicar em julho a fila de março não é
  publicar "a fila de hoje": é reconstituí-la **como ela era** em 31/03 — com as
  liquidações que existiam até lá e os pagamentos feitos até lá. Mês corrente = a
  fila de agora (`mesCorrente: true`).
- **Quem faz a reconstituição é o M06**, não o M12. O bloco 3 acrescentou ao M06 o
  método `filasEm(corte)` — aditivo: sem corte, comportamento idêntico ao anterior.
  Reimplementar a fila aqui criaria uma **segunda verdade** sobre quem tem de ser
  pago primeiro.
- **Cada quebra sai com a posição que a liquidação ocupava QUANDO FUROU, e com quem
  foi preterido.** Uma quebra sem contexto é um texto solto; o §2º manda apurar
  responsabilidade por **preterição**, e para isso é preciso saber **quem** foi
  preterido.

### O detalhe que quase virou bug: `exclusivo`

O pagamento que fura a fila e a `JustificativaQuebraOrdem` nascem na **mesma
transação** — e o Postgres dá a ambos o **mesmo `now()`**. Reconstituir a fila com
corte *inclusivo* no instante da quebra incluiria o próprio pagamento que a causou:
a liquidação teria saldo zero, sumiria da fila, e a posição sairia `null` — o
relatório diria que **ninguém furou nada**. Daí `CorteDaFila.exclusivo`:
estritamente **antes** do instante. O teste trava isso (`posicaoNaEpoca === 3`).

**Guard:** mês futuro = erro. Publicar estrutura vazia daria a impressão de "nada
pendente", que é o oposto de "ainda não aconteceu". Mês sem movimento, porém, é
**estrutura válida e vazia** — não erro.

## Decisões conscientes

- **Previsão inicial == previsão atualizada, hoje.** `ReceitaPrevista` guarda UM
  `valorPrevisto` por natureza/fonte — **não existe reprevisão no modelo**.
  Enquanto não houver, as duas colunas são o mesmo número; emitir a atualizada
  diferente seria **inventá-la**. Ver PENDÊNCIAS.
- **`RETIFICACAO` derruba o relatório.** O enum do M04 tem o valor, nenhum serviço
  dele o emite, e a semântica não está escrita: a linha carrega o **delta** ou o
  **valor novo**? Os dois somam diferente. Chutar aqui é publicar receita errada
  com cara de certa — então o M12 **para e cobra a definição**.
- **Dedução SUBTRAI** da previsão (`SINAL_PREVISAO`). Somá-la infla a receita
  prevista do ente (caso clássico: FUNDEB).
- **Reserva e reserva liberada não são execução.** A reserva é pré-empenho; ela não
  compromete crédito no Anexo 12.
- **Rótulos de categoria/grupo de despesa vêm da Portaria 163/2001**, já presente
  no repo (`prisma/seed/dados/natureza-componentes.ts`) — fonte única, nada
  rebatizado.
- **Saldo de RP = inscritos − pagos − cancelados.** A **liquidação não baixa saldo
  de RP** — ela qualifica o não processado para pagamento, mas a obrigação com o
  credor continua. É a definição que o M08 já usa (`saldoDaInscricao`), e é a única
  que o sistema conhece. O layout não deu a fórmula desta coluna; inventar uma
  segunda aritmética de saldo faria o relatório **divergir do razão que ele deveria
  estar reportando**.

## Pendências

- **PREVISÃO ATUALIZADA** exige um modelo de **reprevisão** de receita (M02) — hoje
  as colunas (a) e (b) saem iguais, por fidelidade ao dado.
- **REFINANCIAMENTO** (linhas IV e XII): emitidas **zeradas**, como manda o layout.
  Identificar operação de crédito por refinanciamento exige uma **regra de
  natureza/elemento** que o esqueleto não deu. Quando vier, é filtro — a linha já
  existe.
- **Origem da receita sem rótulo.** O rol de origens (2º dígito) **não existe como
  tabela**: o M02 semeia só naturezas analíticas. A linha sai com o código
  (`"1.1"`) e `rotulo: null` — batizá-la aqui seria inventar nomenclatura oficial.
  Quando o rol entrar no seed, o rótulo passa a vir do banco.
- **RP: "processados E NP liquidados".** No nosso modelo a inscrição NP **não vira
  processada** ao ser liquidada (M08: uma inscrição, um razão). Logo o pagamento de
  um RPNP liquidado aparece na coluna `pagos` do **quadro 3**, e a coluna
  `liquidados` mostra a migração. Se o TCE exigir que esses pagamentos migrem para
  o quadro 4, é mudança de **agregação**, não de dado.

### Do Anexo 13 (bloco 2)

- **SEM segregação "ordinárias × vinculadas"** nas linhas de fonte: `FonteRecurso`
  **não carrega essa classificação** (só `codigo`, `descricao`, `codigoTce`,
  `codigoStn`). Dizer de memória qual fonte é vinculada seria inventar — a linha
  sai por fonte, com o código e a descrição **que estão no banco**. Quando a flag
  entrar no M02, vira agrupamento.
- **TRANSFERÊNCIAS FINANCEIRAS** (recebidas e concedidas): emitidas **zeradas**. O
  modelo **não tem transferência interórgão** (nem model, nem movimento) — ela é
  fluxo entre entidades do MESMO ente (prefeitura ↔ fundos/autarquias), e o SIAFIC
  atual é de uma entidade só. Quando houver, a linha já existe.
- **`RETIFICACAO` de receita derruba o Anexo 13 também** — mesmo motivo do Anexo 12
  (sinal indefinido). Os dois demonstrativos param no mesmo dado ambíguo.

### Do Anexo 14 (bloco 3 — quadro financeiro/permanente)

> ⚠️ **ATUALIZADO PELO BLOCO 4.** A lacuna abaixo foi FECHADA para as contas que
> têm fato com fonte por trás (caixa, fornecedores, consignações): a **S2** do
> superávit por fonte cruza os FATOS com o RAZÃO+indicador e pega o indicador
> trocado (teste t4 do `m12-superavit-fonte.test.ts`). O que **continua sem rede
> interna** é a conta **sem fato com fonte** — o imobilizado, por exemplo: mover
> uma conta entre os baldes do PERMANENTE não muda soma nenhuma, e os fatos não a
> enxergam. Para essa, as redes externas abaixo seguem valendo.

- **NENHUMA AMARRAÇÃO PEGA UM INDICADOR ERRADO — e isto é uma lacuna real, provada
  pelo t5.** Trocar o `indicadorSuperavit` de uma conta (F→P) no cadastro:
  - a **A1** não vê o indicador (a equação fundamental é cega a ele);
  - a **F1** continua fechando — mover uma conta de balde **não muda a soma dos
    baldes**, e F1 compara somas;
  - a **F2** continua fechando — a conta **tem** indicador; só tem o **errado**.

  O superávit financeiro sai errado **em silêncio, com cara de certo** (no t5:
  `+2.000,00` vira `−6.000,00`). Não há como fechar isso por dentro: o indicador é
  **parâmetro**, e nenhum outro relatório nosso o lê — não existe segunda leitura
  para contradizer a primeira. As duas redes possíveis são **externas**:
  1. **conferir contra a fonte oficial**: o PCASP da STN publica o atributo conta a
     conta. Quando o plano real entrar (hoje as fixtures não têm estrutura real),
     a checagem é no **import** do plano, não no relatório.
  2. **conferir contra o M03**: `DisponibilidadeRecursoNovo(origem =
     SUPERAVIT_FINANCEIRO)` hoje é **digitada e aceita na fé**. Amarrá-la ao
     superávit apurado no balanço de 31/12 do exercício anterior pegaria o erro —
     **mas só de um lado**: um indicador que **reduz** o superávit apurado faria a
     disponibilidade declarada estourar o apurado (dispara); um que o **infla**
     não dispararia nada. É o cruzamento natural do **bloco por fonte**, e mesmo
     ele **não fecha o buraco sozinho**.

  ⚠️ O bloco por fonte **não resolve isto**: ele reparte o mesmo superávit pelo
  mesmo indicador. Uma conta trocada de balde some do total **e** da fonte dela,
  coerentemente. Recortar não é conferir.
- **Superávit financeiro POR FONTE**: fora deste bloco (decisão de escopo). O
  quadro atual é o **total** do ente.
- **A "conjugação" do art. 43, § 2º** (superávit + créditos adicionais transferidos
  + operações de crédito a eles vinculadas) **não está feita**: o quadro entrega
  `AF − PF` puro. Enquanto o superávit não for usado como **fonte** de crédito
  adicional (M03), a conjugação não muda número nenhum.
- **RP inscrito não tem conta patrimonial própria**: a inscrição (M08) é registro
  de **controle** — a obrigação continua em Fornecedores (2.1.3). É **marcar
  Fornecedores como FINANCEIRO** que faz o superávit já nascer descontado dos
  restos. Se um dia houver reclassificação contábil para "RP a pagar", a conta nova
  entra no cadastro **também como F**, e o quadro não muda de forma.

### Do Anexo 14 (bloco 4 — superávit financeiro POR FONTE)

O caixa por fonte é derivado dos **FATOS** (o razão não tem fonte: `PartidaContabil`
só carrega `fichaId`, e a partida da arrecadação nasce sem ficha). É uma **segunda
aritmética** sobre o mesmo dinheiro, e por isso a **S1** existe: se ela não bater
com o caixa do razão, o anexo PARA.

- **NÃO EXISTE MÓDULO DE DÍVIDA / OPERAÇÃO DE CRÉDITO.** Toda entrada de caixa que
  não nasce de um fato com fonte (lançamento direto, operação de crédito) é
  **dinheiro órfão**: a S1 a detecta e derruba o anexo (t2). Isto é o
  comportamento CERTO — mas significa que, enquanto o módulo não existir, um ente
  com operação de crédito **não emite o quadro por fonte**. É a próxima dívida
  estrutural da fila.
- **`Pagamento.fonteId` × fonte da ficha (empenho → ficha): nada obriga a serem a
  mesma.** A TR 5.23 só amarra o pagamento à conta bancária. Pagar um empenho da
  fonte 500 por uma conta da fonte 999 deixaria a 500 com obrigação eterna e a 999
  com caixa a menos — e o **total** continuaria fechando (a S1 e a S2 são somas).
  O guard é do **M05**, não do relatório.
- **A INSCRIÇÃO DE RP NÃO GERA LANÇAMENTO CONTÁBIL** (M08). A obrigação nunca sai
  de Fornecedores (2.1.3) — o MCASP mandaria reclassificar (D fornecedores / C
  restos a pagar). Consequência prática: o roteiro de **pagamento de RP tem de
  apontar `restosAPagarProcessados` para a conta de Fornecedores**, senão o razão
  fica com uma conta de RP negativa e um Fornecedores travado. Falta ao M08 o
  lançamento de reclassificação.
- **O RP NÃO É SUBTRAÍDO do superávit** — e não é esquecimento. O RP processado
  **É** a obrigação a pagar (liquidado − pago), só que rotulada em 31/12: subtrair
  os dois pagaria o mesmo fornecedor duas vezes. Ele aparece na linha porque o art.
  43 quer vê-lo.
- **O RP NÃO PROCESSADO fica de fora do superávit.** Ele não é passivo financeiro:
  a obrigação nem foi liquidada, e vive nas contas de **controle**. Descontá-lo
  antes de abrir crédito é **decisão de política do ente** (prudente, e muitos
  entes fazem), não leitura do balanço — e essa decisão **não é do relatório**.
  Quando o chat decidir, é uma linha a mais, não uma refatoração.
- **`contasCaixa` é PARÂMETRO, e sem ele o quadro por fonte NÃO sai** (vem `null`).
  Sem saber quais contas são caixa, não há como rodar a S1 — e emitir um superávit
  que ninguém conferiu, sendo ele o que lastreia crédito adicional, é pior do que
  não emitir.
- **Onde os totais moram** (invariante "uma aritmética, muitos recortes"): o
  relatório **não soma nada**. `arrecadadoPorFonte` (M04), `despesaPorFonte` (M05),
  `extraorcamentarioPorFonte` (M07), `restosAPagarPorFonte` (M08) — cada um no dono
  do dado, reusando a aritmética que já existia (`sinalDaReceitaRealizada`,
  `somaLiquidaEstornaveis`, `tetoConciliavelDoPagamento`, `totaisPorConsignatario`,
  `saldoDaInscricao`). O `SINAL_RECEITA_REALIZADA` **mudou de casa** (M12 → M04):
  ele é do dono do fato, e mantê-lo aqui fecharia um ciclo `m04 → m12 → m04`.

## Arquivos deste módulo

- `modules/m12-relatorios/` — `dominio.ts` (puro: sinais, classificação, montagem
  dos quadros, amarração), `balanco-orcamentario.ts` (leitura por SUM), `index.ts`,
  testes `m12-dominio.test.ts` e `m12-balanco.test.ts` (**o teste de ouro**).
- `prisma/schema/m12-relatorios.prisma` — **só o mapeamento** (`LinhaDemonstrativo`,
  `PrefixoDaLinha`). Parametrização, não fato: ver a correção de doutrina no topo.
- `balanco-patrimonial.ts` (Anexo 14), `dvp.ts` (Anexo 15), `cadastro-linhas.ts`
  (o ÚNICO que grava — e grava cadastro, não relatório).

## Fora de escopo aqui

- **UI / PDF / planilha** — o M12 entrega **estrutura tipada**. Renderização é outro
  eixo.
- **Exports federais (SICONFI/SAGRES)** → M14.
- **Publicação no portal** → M13.

---

# 7.5 — RGF Anexo 5: Disponibilidade de Caixa e Restos a Pagar

LRF art. 55, III, "a". `modules/m12-relatorios/rgf-anexo5.ts` + `/relatorios/rgf/anexo5`.

## O que este anexo decide

É ele que **autoriza ou proíbe inscrever RPNP**, e a regra da STN é **por vinculação**:
o RPNP só se inscreve se *aquela fonte* tiver disponibilidade líquida. Um ente com caixa
sobrando na fonte livre e furado no FUNDEB **não pode** inscrever RPNP no FUNDEB — o
dinheiro é carimbado, e o superávit da outra fonte não o socorre.

Por isso **não existe total que salve**, e o teste prova: no cenário do t3 o total é
`+23.000` (positivo) enquanto o FUNDEB está furado em `−20.000`. Quem lê só o total
conclui o contrário do que a norma diz. Daí `fontesInsuficientes` no retorno e o alerta
no topo da página.

## Nada de aritmética nova

Cada coluna vem do módulo **dono** do dado:

| Col | Semântica | Origem |
|---|---|---|
| (a) | disponibilidade bruta | `linhasDoSuperavitPorFonte` (M12, que compõe M04/M05/M07/M08) |
| (b) | RP liquidados e não pagos — exerc. anteriores | `restosAPagarPorFonte.processado` (M08) |
| (c) | RP liquidados e não pagos — do exercício | `obrigacoesDoExercicioPorFonte` (M05) |
| (d) | RP empenhados e não liquidados — anteriores | `restosAPagarPorFonte.naoProcessado` (M08) |
| (e) | demais obrigações financeiras | `consignacoesARepassar` (M07) |
| (f) | = a − (b+c+d+e) | derivado |
| (g) | RPNP inscritos no exercício | `InscricaoRestosAPagar` por `exercicioOrigem` |
| (i) | = f − g | derivado |

## ⚠️ A interpretação dos restituíveis (registrada, não inventada)

O dinheiro retido de terceiros **está no banco** — logo está em (a). A obrigação de
repassá-lo é (e). É a **única** leitura em que a identidade fecha sem dupla contagem:
tirá-lo de (a) *e* subtraí-lo em (e) o descontaria duas vezes.

A frase corrente *"restituíveis não são disponibilidade"* descreve o **resultado
líquido** (i), não a coluna (a). Fonte: Tabela de Fatos RGF (Siconfi/STN). Coerente com
o `superavit-por-fonte`, que já lia assim.

## As letras são apresentação; as chaves são o dado

As edições do MDF renumeram as colunas (SP usa (g)/(h)/(i) onde o Siconfi usa
(f)/(g)/(i)). As chaves do `LinhaAnexo5` são **semânticas e estáveis**; a letra vive em
`COLUNAS_ANEXO5`, que é cadastro — a mesma doutrina do mapa-de-linhas.

## ⚠️ `CANCELADOS-POR-INSUFICIENCIA` — interruptor vazio nomeado

A coluna quer os empenhos não liquidados cancelados **por insuficiência financeira**. O
M08 grava `MovimentoRestosAPagar.motivo` como **texto livre** — não distingue o motivo
como fato. Inferir "insuficiência" dali seria adivinhar retroativamente a intenção de
quem cancelou, e carimbar de ilegal um cancelamento que pode ter sido por objeto não
entregue. Fica **zero, nomeado**, até o M08 ter o motivo como dado.

## O bug que o t5 pegou

`restosAPagarPorFonte` incluía a inscrição do **exercício corrente** em (d) — ela nasce
em 31/12, dentro do corte. Sem o recorte `exercicioOrigemAte: exercicio − 1`, o mesmo
RPNP era descontado **duas vezes**: em (d) e em (g). A linha do FUNDEB saía `−25.000` em
vez de `−20.000`. O parâmetro é opcional; ausente = o comportamento de sempre (Anexo 14,
superávit).

## O que este anexo DESTRAVA (consumidores, não implementados aqui)

- **MDE bloco 2** (superávit 10% / 1º quadrimestre, CF art. 212): vai ler a
  **disponibilidade líquida (i) da fonte de educação** para saber quanto do mínimo pode
  ser diferido. Hoje o Anexo 8 não tem essa conta.
- **Controles de RP dos Anexos 8 e 12** (MDE e ASPS): ambos precisam saber se os RP das
  fontes vinculadas têm **lastro financeiro** — é (b)+(d) por fonte que responde. Sem
  isso, os dois contam como aplicado um resto a pagar que o ente não pode honrar.
- **O encerramento do M08** poderá, um dia, **recusar** a inscrição de RPNP sem
  disponibilidade — hoje ele inscreve e o Anexo 5 apenas *denuncia*. Isso é decisão de
  domínio (e de política), não do relatório: pendência **RPNP-GUARD-INSCRICAO**.

---

# 7.7 — RGF Anexo 2: Dívida Consolidada Líquida

LRF art. 55, I, "b". `rgf-anexo2.ts` + `/relatorios/rgf/anexo2` + `m10-patrimonial/consultas.ts`.

## O que este anexo decide

Se o ente cabe no limite de endividamento do Senado (**120%** da RCL ajustada) e se
disparou o **alerta** do art. 59, §1º, III (**108%**). Estourar suspende o ente de
contratar operação de crédito e de receber transferências voluntárias.

## ⚠️ A NOTA ¹ — o saldo negativo que não é negativo

Literal (Siconfi, municípios):

> "Se o saldo apurado for negativo, ou seja, se o total da Disponibilidade de Caixa Bruta
> for menor que Restos a Pagar Processados, esse saldo negativo não deverá ser informado
> nessa linha, mas sim na linha da 'Insuficiência Financeira' [...]. Assim, quando o
> cálculo de Disponibilidade de Caixa for negativo, o valor dessa linha deverá ser (0)
> zero."

**Não é opção de apresentação — é regra**, e tem uma razão dura: uma dedução negativa
**aumentaria** a DCL, porque subtrair um negativo soma. No cenário do t2, a DCL sairia
`700.000 − (−50.000) = 750.000` — o ente apareceria devendo 50.000 a mais do que a lei
manda medir, e o buraco de caixa sumiria *dentro da dívida* em vez de aparecer na linha
que existe para mostrá-lo.

A `insuficienciaFinanceira` é **absoluta**, sem menos: é uma falta, não um saldo credor.

## Um dono por número

| Linha | Origem |
|---|---|
| (I) Dívida Mobiliária / Contratual | `saldoDaDividaPorTipo` (M10), que agrega `saldoDaDividaEm` — o dono do saldo de cada dívida |
| Disponibilidade de Caixa Bruta | **`totalBruta` do `rgfAnexo5`** — o Anexo 2 **consome**, não recalcula |
| (−) RP Processados | `restosAPagarPorFonte` (M08), mesmo corte do Anexo 5 |
| (IV) RCL / (V) emendas | `anexo3` — o **mesmo** motor do RGF Anexo 1 |
| Passivo Atuarial | `passivoAtuarialEm` (M10), Σ das provisões (TR 5.89) |
| Dívida Contratual de PPP | `anexo13` — o dono do cadastro |

**R3 é identidade POR CONSTRUÇÃO, não confronto** — e o teste a registra como tal: ele
trava contra regressão (o dia em que alguém "otimizar" somando o caixa por conta
própria), não "descobre" uma coincidência.

## As linhas-parâmetro vazias nomeadas

O grep do Passo 0 é a prova: `precatorio`, `ARO` e `depósito judicial` só aparecem em
**comentários** do censo — não há entidade para nenhum. Inventar número seria publicar
dívida que ninguém cadastrou; omitir a linha esconderia que ela existe no layout. Vão a
zero, nomeadas, e a página as marca com um badge "sem cadastro".

- **`PRECATORIOS-CADASTRO`** — as três linhas de precatório (a da DC e as duas do informativo)
- **`ARO-CADASTRO`** · **`DEPOSITOS-SEM-CORRESPONDENCIA`** · **`DEMAIS-HAVERES-FINANCEIROS`**
- **`DIVIDA-INTERNA-EXTERNA`** — o cadastro tem `enum TipoDivida { CONTRATUAL, MOBILIARIA }`
  e **não** distingue interna × externa. Inferi-la do nome do credor seria adivinhação.
  "Demais Dívidas" fica zero: toda dívida cadastrada cai num dos dois tipos.
- **`PPP-DIVIDA-CRITERIO`** — o layout diz "Dívida Contratual de PPP" sem dizer qual
  medida (valor global, saldo devedor ou contraprestações a pagar). Adotado o **valor
  global**, o mais conservador; se a norma quiser o saldo devedor, o número está para
  **mais**, e é no `montarInformativo` que se corrige.
- **`SEM-RCL-NO-CORTE`** — RCL ajustada zero ⇒ percentuais `null`, não "0,00%": sem RCL
  não há limite a medir, e é a divisão por zero que produziria um zero que o leitor
  tomaria por folga.

## A NOTA ² não entra

A nota ² (excedente ao limite apurado ao fim de **2001**, redutível a 1/15 por exercício)
só se aplica a ente que excedia naquele ano. Não há esse dado no sistema, e não haveria
como havê-lo: é história anterior a este software. **Omitida**, registrada aqui.

## Três estados, não dois

O Badge do percentual tem **verde / âmbar / vermelho**. O âmbar é o alerta do art. 59: o
ente ainda cabe no limite, mas o Tribunal já o avisa. Pintá-lo de vermelho diria que
estourou; de verde, que está tudo bem. Nenhum dos dois é verdade.

---

# RREO Anexo 6 e o furo dos de-paras de receita (7.8-a)

O **Anexo 6** (Resultado Primario e Nominal, acima da linha) e o achado
**EMENTARIO-RECEITA-DO-ENTE** estao em `MODULO-RREO-ANEXO6.md`: a armadilha da dupla
contagem do RP, a decisao 0.5-A (multas e juros de mora sao primarios), os interruptores
nomeados, e o diagnostico de que os dois de-paras de receita discordam de 3 dos 4 impostos
municipais porque nenhum teste os importa.

---

# 7.9 — O ementário da receita: os de-paras ganham lastro

A 7.8-a diagnosticou (`MODULO-RREO-ANEXO6.md`): `depara-rcl-anexo3.ts` e `asps-deparas.ts`
discordavam de **três dos quatro** impostos municipais, cada um construído contra as
fixtures que tinha à mão, e ninguém via porque **nenhum teste os importava**. A 7.9 quita o
achado com o documento que faltava.

## O extrato oficial é a autoridade — e mora no teste

O ementário oficial da receita do ente (seção de impostos, hierarquia literal) foi colado
como constante em **`prisma/seed/dados/depara-impostos.test.ts`**, com a fonte no cabeçalho.
Não é decoração: é o teste que **importa os dois de-paras de produção** e prova que eles
apontam o mesmo código para o mesmo imposto, que todo código de imposto mapeado existe no
extrato, e que nenhum código do extrato aparece com a chave errada. É o R3 que deveria
existir desde sempre — e ele é sobre o SEED, não sobre fixture, porque fixture foi
exatamente o que enganou os dois arquivos.

| imposto | antes (rcl / asps) | agora (os dois) | ementário |
|---|---|---|---|
| IPTU | `11130111` / `11121101` | `11180111` (+2/3/4 no asps) | 1.1.1.8.01.1.1-4 |
| ITBI | `11120111` / `11120111` | `11180141` | 1.1.1.8.01.4.1 |
| ISS | `11140111` / `11180111` | `11180231` (+232 no asps) | 1.1.1.8.02.3.1-2 |
| IRRF | *(interruptor)* / `11180311` | `11130311` | 1.1.1.3.03.1.1 |

⚠️ **O ITBI mudou mesmo sendo o único em que os dois JÁ concordavam.** Concordância não é
lastro: os dois estavam igualmente errados, e foi o acordo que fez o erro parecer verdade.

**`LINHAS_SEM_NATUREZA_ANEXO3` ficou VAZIA.** A 7.8-a pôs "IRRF" ali por falta de lastro,
não por ausência do imposto; o extrato deu o código e o interruptor desligou. A lista fica
exportada e viva — ela é o mecanismo, não o caso.

## O que a 7.9 NÃO fez: `TRANSFERENCIAS-SEM-EMENTARIO`

O extrato cobre a seção de **impostos**. As sete transferências e a dedução do FUNDEB
seguem com os códigos de antes, nunca conferidos — pendência nomeada em
`depara-rcl-anexo3.ts`. E há uma **contradição viva** que a 7.9 achou e deliberadamente não
consertou: o `17210651` é `LC61` (IPI-Exportação) no de-para da RCL e `IOF_OURO` no do
Anexo 12. São tributos diferentes, `base-impostos.ts` tem os dois como linhas distintas da
Tabela 12.2, e exatamente um dos dois seeds está errado. O extrato não desempata (não fala
de transferências), e escolher no escuro repetiria a falha que esta sessão veio corrigir.
Quita-se buscando a seção de transferências do ementário.

## ⚠️ INSTRUÇÃO OPERACIONAL — rode o diagnóstico após CADA atualização de seed

```
npm run seed:m12-depara && npm run seed:m12-asps   # aplica as listas
npm run seed:diagnostico                            # ⚠️ OBRIGATÓRIO em ambiente povoado
```

**Todos os seeds de de-para são upsert-only, sem delete.** Tirar uma linha da lista **não a
apaga do banco**. Num ambiente que rodou o seed anterior à 7.9, os sete códigos velhos
continuam gravados **ao lado dos novos** — e como o motor lê o BANCO, o mesmo IPTU seria
contado por duas naturezas diferentes: o total infla e nada acusa. O seed roda, imprime
verde, e mente.

`seed:diagnostico` (`prisma/seed/m12-diagnostico-deparas.ts`) varre as três tabelas de
de-para, lista as **órfãs** (gravadas no banco, ausentes da lista) com `criadoPor` e
`criadoEm`, e **sai com exit 1** quando acha alguma — um diagnóstico que acha problema e
devolve 0 é a mesma armadilha da suíte pulada que o `global-setup` recusa.

**Ele não apaga, e isso é a decisão, não uma limitação.** Remoção em banco povoado é ato
deliberado, com identidade e trilha: uma órfã com `criadoPor: "SEED"` é retratação do
próprio seed, mas uma com `criadoPor` de uma pessoa é decisão do ente que o seed nunca
conheceu. As duas pedem tratamento diferente, e nenhuma das duas sai de um script que roda
sozinho e sem dono.

---

# 7.10 — RGF Anexos 3 e 4, e o MARCO: o RGF está COMPLETO

Os Anexos 3 (Garantias) e 4 (Operações de Crédito) fecham o Relatório de Gestão Fiscal. O
RGF agora tem **todos os anexos que a LRF art. 55 pede**:

| Anexo | O que mede | Limite | Motor |
|---|---|---|---|
| 1 | Despesa com Pessoal, por Poder | 54% / 6% da RCL | `rgf-anexo1.ts` |
| 2 | Dívida Consolidada Líquida | 120% / 108% | `rgf-anexo2.ts` |
| **3** | **Garantias e Contragarantias** | **22% / 19,8%** | **`rgf-anexo3.ts`** |
| **4** | **Operações de Crédito** (+ ARO 7%) | **16% / 14,4%** | **`rgf-anexo4.ts`** |
| 5 | Disponibilidade de Caixa e RP | (sem %; suficiência) | `rgf-anexo5.ts` |

## O motor único da RCL (o que a sessão consolidou)

A regra Siconfi é dura: a RCL dos Anexos 1/2/3/4 do RGF tem de ser a MESMA do RREO Anexo 3
do período. `rcl-ajustada.ts` (`rclAjustadaDoQuadrimestre`) é agora o **dono único** dessa
conta para a família da dívida (Anexos 2/3/4) — puxa a RCL de `anexo3(...).rcl.total12m` e
subtrai as emendas individuais. O Anexo 2 foi refatorado para consumi-lo (comportamento
idêntico, os 5 testes seguem verdes). Os guards R1/R2 travam a igualdade contra o RREO
Anexo 3. ⚠️ NÃO confundir com a ajustada do Anexo 1 (pessoal), que deduz também bancada e
ACS/ACE — é outra base, outro limite.

## Os interruptores desta sessão (Passo 0)

- **`GARANTIAS-SEM-CADASTRO`** — não há entidade de garantia. O Anexo 3 nasce ZERADO, e é um
  demonstrativo VÁLIDO: o município declarando que não avalizou dívida de ninguém. Publicar
  zerado ≠ esconder.
- **`VEDADAS-DEDUZIDAS-SEM-CADASTRO`** / **`ARO-CADASTRO`** (a mesma chave do Anexo 2) /
  **`ART-29-§1º-SEM-CADASTRO`** — sem fato no M10 (o `TipoMovimentoDivida` só tem ingresso,
  atualização e amortização). Linhas nomeadas, zero.
- **`AMARRACAO-OPCRED`** — quando a receita de op. crédito internas não bate com os ingressos
  de dívida cadastrada (composto 4.64 não usado). Vazia no caso feliz.

## A amarração 4.64 (R3): dois subsistemas, um fato

O Anexo 4 mede a operação de crédito pela RECEITA (origem 21, M04) — é o que o demonstrativo
mede. O sub-split Mobiliária × Contratual das internas NÃO está na natureza; vem dos
ingressos do M10 por tipo de dívida (`ingressosOperacaoCreditoPorTipo`, leitor novo). O
composto `arrecadarIngressoOperacaoCredito` grava os dois na mesma transação, então
`internas-receita == Σ ingressos (mob + contr)` — o R3 trava. ⚠️ **Gap nomeado**: op. crédito
EXTERNA não tem tipo de dívida próprio (o enum só tem MOBILIARIA/CONTRATUAL), então a
amarração interna/externa da dívida é pendência para quando houver dívida externa cadastrada.

## O que este marco DESTRAVA

Com o RGF completo e a DCL/RCL consolidadas, dois demonstrativos ficam ao alcance, ambos na
forma SIMPLIFICADA (consolidam o que já existe, sem aritmética nova):

- **RGF Anexo 6 — Demonstrativo Simplificado do RGF**: uma capa que lê o percentual e a
  situação de CADA anexo e os põe numa tabela única (pessoal do Anexo 1; DCL do Anexo 2;
  garantias do Anexo 3; operações de crédito do Anexo 4; RP do Anexo 5). Zero motor novo — é
  leitura dos cinco motores existentes, com os Badges de 3 estados que já produzem.
- **RREO Anexo 14 — Demonstrativo Simplificado do RREO**: idem para o RREO, lendo o resultado
  primário/nominal (Anexo 6), a RCL (Anexo 3), a despesa com pessoal e os limites já apurados.
  Consolida; não recalcula.

Ambos são "capas": o valor está em NÃO reabrir a conta de cada limite, e sim citar o dono.

---

# 7.11 — Os simplificados (RGF 6, RREO 14): o M12 está quase inteiro

Com os demonstrativos SIMPLIFICADOS, o eixo de relatórios chega perto do fim:

- **RGF: 6/6 anexos** — 1 (pessoal), 2 (dívida), 3 (garantias), 4 (op. crédito), 5
  (disponibilidade) e **6 (simplificado)**.
- **RREO: 13 dos 14 anexos** vivos — falta só o **Anexo 4 (previdenciário, RPPS/IPSEM)**, que
  aguarda o universo de dados do regime próprio.

## A doutrina dos simplificados: um dono, zero recálculo

`simplificado.ts` define a `LinhaSimplificada` e os tradutores de estado. `rgf-anexo6.ts` e
`rreo-anexo14.ts` são CAPAS: cada linha LÊ um campo do motor analítico e o repete — o percentual e
o limite não nascem ali. O `situacao` é derivado dos MESMOS booleanos de limite que o anexo de
origem calculou, então o Badge do simplificado é o mesmo do analítico: **nunca discordam, porque o
simplificado não tem opinião própria.** O teste é de IDENTIDADE (cada linha == o campo do dono na
mesma fixture), não de aritmética — se o simplificado lesse o campo errado, o teste cai.

## Os furos que os simplificados DECLARAM (não zeram)

- **`ANEXO4-PENDENTE`** (RREO 14) — o bloco RPPS é declarado ausente, não publicado zerado. Zero
  afirmaria "não há regime próprio"; o que há é "ainda não o medimos".
- **`RESULTADO-NOMINAL-XXVII-NULL`** (RREO 14) — o nominal ACIMA (XXVII) é `null` (o XXV é
  interruptor). O simplificado usa o nominal CONCRETO do abaixo-da-linha (variação da DCL), que mede
  o mesmo resultado pelo estoque sem depender do XXV. O espelho da 7.8-b, em ação.
- **`MDE-25-NAO-CONSOLIDADO`** (RREO 14) — o Anexo 8 é dono do indicador dos PROFISSIONAIS (FUNDEB,
  70%), não do % aplicado no mínimo de 25% (CF 212). O simplificado mostra o que o dono tem e não
  recalcula o 25% por conta própria (seria recálculo, e o simplificado não recalcula).
- **`DISPONIBILIDADE-SO-NO-3O-QUADRIMESTRE`** (RGF 6) — o bloco do Anexo 5 só aparece no último
  quadrimestre (regra oficial). Nos 1º/2º é ausência de fato, não zero — condicional testada.

## O que DESTRAVA em seguida, e o que aguarda dado externo do Winner

O RREO Anexo 4 (previdenciário) é o último anexo, e ele — como vários itens já nomeados nas
sessões anteriores — depende de **dado externo que só o Winner pode trazer**:

| Pendência | O que aguarda |
|---|---|
| **RREO Anexo 4 (RPPS)** | o universo de dados do regime próprio de previdência (IPSEM) |
| **de-para completo da receita** | a planilha xlsx da 15ª edição do MDF (as centenas de naturezas) |
| **META-FISCAL-LDO / IEI** | o Anexo de Metas Fiscais da LDO (não há entidade de meta) |
| **MATRICULAS-POR-AREA** | o censo escolar do ente (rateio da despesa de educação) |
| **Anexo IV Portaria 700** | o layout previdenciário federal |
| **token ASTEC / TCE-PB** | credencial de transmissão ao Tribunal |
| **credenciamento BB** | a integração bancária (pagamentos/OBn) |

Nenhum desses é código faltando — é DADO que o sistema não pode inventar. O que se podia construir
com a estrutura pronta, está construído; o resto tem dono, e o dono é o ente.

## Dev navegável (7.11-F0)

O banco de DESENVOLVIMENTO foi levantado: migrations aplicadas, SQL manual (constraints/índices
parciais) aplicado, seeds oficiais (M02, PCASP, DePara×4) rodados, e o **bootstrap** criou o
administrador de instalação (a senha forte vive em `.env.local`, fora do git). O diagnóstico de
órfãs da 7.9 acusou ZERO. O banco fica pronto e VAZIO de execução — as telas mostram `EstadoVazio`
com dignidade, e a primeira carga real (fichas, empenhos) é ato do Winner, não do seed.

---

# 7.16 — Relatório de Consistência (TR 5.128–5.131 · 7.27)

O motor de diagnóstico (`consistencia.ts`) VISITA as identidades que os donos já calculam e devolve
a tríade **OK / DIVERGE / SEM_DADO**. Página interna `/relatorios/consistencia`.

## A doutrina: identidade tem um dono; o diagnóstico visita, não reimplementa

Cada verificação CHAMA a função do módulo dono e lê os dois lados que ela já produz. Zero aritmética
nova — se o diagnóstico recomputasse o balanço, poderia divergir do relatório oficial, e aí qual dos
dois o TCE acredita? O `fonte`/`fonteHref` de cada linha aponta o dono ("onde mora").

⚠️ **A tríade é a alma.** `SEM_DADO` nunca se disfarça de `OK`: um verde que não verificou nada é
pior que um vermelho (o vermelho manda consertar; o falso-verde manda seguir em frente). E a
distinção fina: um dono fail-closed que estoura por **cadastro ausente** ("conta órfã / mapeie a
linha") vira **SEM_DADO**; um que estoura por **número que não bate** ("ativo ≠ passivo") vira
**DIVERGE**. Jogar os dois em DIVERGE faria o diagnóstico gritar "erro!" quando falta um cadastro.

## Passo 0.1 — o inventário (vivas × extraídas × fora-com-nota)

| Identidade | Dono | Exportável? | No motor |
|---|---|---|---|
| Balancete fecha (ΣDevedor==ΣCredor; ΣDébito==ΣCrédito) | `balancete()` | SIM (janela, sem throw) | **VISITADA** (MENSAL) |
| Balanço Patrimonial (Ativo==Passivo+PL) | `balancoPatrimonial()` | SIM (corte, fail-closed) | **VISITADA** (ANUAL) |
| DVP × Balanço (resultado patrimonial == resultado do exercício) | `dvp()` + `balancoPatrimonial()` | SIM | **VISITADA** (ANUAL) |
| Balanço Orçamentário (equilíbrio VII==XV) | `balancoOrcamentario()` | SIM (fail-closed na geração) | **VISITADA** (ANUAL) |
| Superávit S1 (caixa fatos == razão) | `superavitFinanceiroPorFonte()` | SIM (corte, throw) | fora-com-nota (throw exige `contasCaixa`) |
| DDR (baldes == arrecadado) | `saldoDdrPorFonte()` | SIM | fora-com-nota (não devolve o "arrecadado" ao lado) |
| Partidas dobradas POR SUBSISTEMA | `validarLancamento` (write-time) | não há leitor | invariante de write-time — re-check redundante (nota) |
| Diário × Razão × Balancete | 3 funções, mesma fonte `somasPorConta` | SIM | representado pelo balancete (visitar uma é visitar as três) |
| Encerramento/RP (RPP=liq−pago, RPNP=emp−liq) | `encerrarExercicioComRestos` (write) | write-time | fora-com-nota (não é leitor de dois lados) |

## Passo 0.2 — o gap (pendência nomeada)

**`PLANEJAMENTO-SEM-MOTOR` (5.129):** não há motor de consistência **LOA=ΣQDD** nem **PPA↔LOA**. O
lado receita (previsto × realizado) vive no RREO Anexo 12, e há o confronto MBA do art. 9º — mas a
amarração dotação × QDD × PPA **não tem dono**. O escopo PLANEJAMENTO retorna **SEM_DADO** nomeado.
A sessão futura: um motor de planejamento (M02b — PPA/LDO/LOA), e aí o escopo ganha verificações
vivas. Até lá, o diagnóstico DECLARA a ausência, não inventa a verificação.

## F3 — o diagnóstico pré-envio (7.27)

`diagnosticoPreEnvio` compõe os três escopos num veredito único ("pronto para envio: sim/não + o
que trava"). Consome `executarVerificacoes`, zero verificação própria. Uma **DIVERGE trava** (o
número está errado); um **SEM_DADO não trava** (falta cadastro, não há erro) — mas aparece, e quem
envia decide se o vazio é aceitável. É o checklist que antecede a MSC/Siconfi.

## Por que a consistência NÃO entra na área pública (7.15)

Ela é ferramenta de CONFERÊNCIA do ente — mostra onde os números NÃO batem. Publicá-la exporia o
trabalho interno, não o demonstrativo oficial. Fica atrás do shell autenticado; se um PDF for
gerado, sai pelo builder da 7.15 por rota AUTENTICADA, nunca pela `lista-publica`.

---

# 7.17 — Motor de consistência da LOA (TR 4.17 · 5.129): PLANEJAMENTO-SEM-MOTOR quitado

O gap da 7.16 foi fechado. O escopo PLANEJAMENTO deixou de ser um SEM_DADO-total e passou a
VISITAR o motor da LOA (`consistencia-loa.ts`) pelo mesmo contrato (extraído para
`consistencia-contrato.ts`, para não haver ciclo). A doutrina segue: **cada identidade é função
exportada com os dois lados prontos; o diagnóstico visita, não reimplementa; nenhuma segunda
classificação** — o de-para de impostos e o marcador de intra são os mesmos dos anexos, só se troca
a FONTE do dado (previsão no lugar de execução).

## O que entrou (vivas)

| Verificação | Identidade | Lados |
|---|---|---|
| `LOA_EQUILIBRIO` | Σ receita prevista ATUALIZADA == Σ dotação FIXADA (art. 4º) | receita (inicial+reprevisão) × Σ valorDotado |
| `LOA_POR_FONTE` | por fonte: receita prevista == dotação fixada | totais + desalinhamento Σ\|gap\| (pega o furo mesmo com totais anulando) |
| `LOA_INTRA` | receita intra (cat. 7/8) == despesa intra (modalidade 91) | SEM_DADO se não houver intra |
| `LOA_MDE_25` | dotação função 12 ≥ 25% da base de impostos+transf. prevista | piso; de-para do Anexo 8/12 sobre a previsão |
| `LOA_SAUDE_15` | dotação função 10 ≥ 15% da base prevista | piso; idem |

Atualização da tabela da 7.16: o `PLANEJAMENTO-SEM-MOTOR` sai de SEM_DADO-total e vira as
verificações acima. Novos leitores extraídos: `dotacaoFixadaDetalhada` (M02 — a dotação fixada no
grão da ficha) e o classificador `INTRA-DESPESA-MODALIDADE-91` (que nasceu aqui: `codModalidade === "91"`).

## O que ficou fora, e por quê (o achado do Passo 0)

- **`ACAO-QDD-VACUA`** — `Acao` não tem valor próprio; o valor de uma ação É Σ Fichas por
  construção, e **não existe entidade QDD** (o grão QDD é a ficha). Não há segundo número
  independente para confrontar → identidade vazia, NÃO implementada (seria 0==0 trivial). Nota, não
  verificação.
- **`PPA-SEM-ENTIDADE`** — não há entidade de PPA no repositório, então PPA↔LOA não tem os dois
  lados. Pendência: quando o M02b modelar PPA (metas/programas plurianuais), a amarração PPA↔LOA
  ganha função e entra no escopo.
- **`FUNDEB-VAAT-SEM-CLASSE-DE-FONTE`** — o 70% dos profissionais e o VAAT dependem da CLASSE DE
  FONTE (FUNDEB×VAAT) da despesa, e a previsão não a distingue (o de-para de classe de fonte é de
  execução). SEM_DADO nomeado — nunca se projeta sobre uma classe que a LOA não tem.
- **`RCL-PROJETADA-SEM-MOTOR`** — a RCL da LOA é estimativa, e o motor de RCL é 12-meses REALIZADO
  (welded à execução). Pessoal × RCL é INFORMATIVA (não guard) e fica SEM_DADO até haver um motor de
  RCL projetada.
- **`MDE/SAUDE-BASE-SEM-DEPARA`** — sem o de-para de base de impostos semeado, não há base prevista;
  SEM_DADO (interruptor do DePara), nunca projeção sobre base inexistente.

## Consumidores futuros (as mesmas funções)

Os relatórios analíticos de conferência **4.12–4.16** (analíticos da LOA por órgão/função/fonte)
consumirão os MESMOS leitores (`dotacaoFixadaDetalhada`, `previsaoPorNaturezaFonte`) e o mesmo
de-para — sem segunda classificação. O motor de consistência é o primeiro cliente; os analíticos, os
próximos.

---

## O custo por centro (V19/C05)

A apropriação de custo mora aqui, e não no M05, porque o requisito pede que ela **alcance os
relatórios** — e porque no M05 a dimensão de custo seria uma classificação gerencial que o próprio
módulo não usa: o empenho, a liquidação e o pagamento não mudam de comportamento por causa dela. O
custo é uma LEITURA que se acumula, e o fato que a alimenta referencia a liquidação sem alterá-la.

Quatro decisões, cada uma com a alternativa que ela descarta:

| Decisão | A alternativa, e o que ela produziria |
|---|---|
| O centro de custo é o `Setor` que já existe | um quarto organograma — e o custo por centro deixaria de casar com o consumo de material (M10), a solicitação de compra (M11) e a despesa de pessoal (M32), que já somam nesse eixo |
| A apropriação **não lança no razão** | a variação patrimonial diminutiva contada duas vezes, e o resultado do exercício errado sem que nada desbalanceie |
| O resíduo em centavos tem **dono declarado** (coluna do critério) | o centavo caindo no último da lista — e o relatório passando a depender da ordem em que o banco devolveu as linhas |
| O critério é **versionado**, e a leitura soma as PARTES GRAVADAS | recalcular o rateio na leitura, e o custo de um mês fechado mudando quando a régua de hoje muda |

O teto da apropriação é o **líquido** da liquidação (`somaLiquidaEstornaveis`, a mesma função do
relatório de restos e do caixa por fonte) menos o que dela já foi apropriado. Apropriar sobre a linha
de anulação é recusado: o fato é a liquidação original, cujo líquido já desconta a anulação.

Arquivos: `custos.ts` (a aritmética e as entradas), `custos-servico.ts` (os dois atos),
`custos-consultas.ts` (o acumulado e a composição). Ações no censo:
`PARAMETRIZAR_RATEIO_DE_CUSTO` e `APROPRIAR_CUSTO` — **duas**, porque publicar a régua é ato
normativo do ente e apropriar é ato de execução mensal; fundir daria a quem lança o poder de
reescrever a régua pela qual ele próprio é medido.

### O que falta, nomeado

- **`FOLHA-SEM-RATEIO-POR-CENTRO`** — o `HistoricoVinculo` já tem `centroDeCustoId`, mas a folha
  fechada não gera apropriação de custo. Hoje o custo de pessoal por centro não aparece neste
  relatório.
- **`BASE-DE-RATEIO-CALCULADA`** — `BaseDeRateioDeCusto` tem um único valor,
  `PERCENTUAL_DECLARADO`. Base por metro quadrado, por número de servidores ou por atendimento
  exigiria um medidor por centro e por competência, que não existe.
- **`CUSTO-POR-PROGRAMA`** — o eixo aqui é o centro (setor). Custo por programa/ação exigiria
  apropriar também no eixo da classificação funcional-programática, e a decisão de se os dois eixos
  coexistem num só fato ou em dois não está tomada.
- **`DEPRECIACAO-SEM-CENTRO`** — a parcela de depreciação do M10 não vira custo de centro, embora o
  bem tenha localização física em um setor.
- ~~**`PERCENTUAL-RESIDUAL-LIDO-COM-DUAS-CASAS`**~~ **RESOLVIDA na V28** (leitura, entrada, avaliador de fórmula e tela com seis casas; teste N=2 com 12,5% e 3,3333% e prova por mutação em `m10-parametros-versoes.test.ts` t7 e `m10-formula-avaliacao.test.ts`). Achado ao construir C05: `parametros.ts` e
  `gestao-do-bem.ts` do M10 leem `percentualResidual` (`Decimal(9,6)`) com `toMoney(...toFixed(6))`,
  e `toMoney` arredonda a DUAS casas. Um residual de 0,05 não sofre; um de 0,033333 viraria 0,03.
  A correção é `toPercentual` (`packages/contracts/percentual.ts`), e ela não foi feita aqui porque
  mexe na aritmética da depreciação, que tem suíte própria a reconferir.

## O veredito dos mínimos sai do dinheiro, não do percentual (V22)

`apuracao-do-minimo.ts` — `apurarMinimo(aplicado, base, limite)`, usada pelo Anexo 12 (ASPS, 15%) e
pelo indicador dos profissionais do Anexo 8 (70% do FUNDEB).

**Defeito medido na tela do Anexo 12:** base de impostos 0,00 e aplicado 37.875,00 saíam como
"0,00%", "abaixo de 15%" e "Falta para o mínimo 37.875,00". O defeito era do MOTOR: o `atingiu`
vinha do percentual arredondado, que vale "0.00" por convenção quando a base é zero — e que, no
outro sentido, arredonda 14,996% para "15.00" e dava "≥ 15%" com R$ 0,04 faltando. Agora o veredito
é `aplicado × 100 ≥ base × limite`, exato, e o selo concorda com o sinal da diferença.
`m12-apuracao-do-minimo.test.ts` (N=2 nas duas direções) falhou 5/5 antes e passa 5/5 depois;
mutação provada (volta ao percentual: 5 vermelhos; conserto só da base zero: 4 vermelhos).

A tela, com base nula, mostra "—" no lugar do percentual e o selo "sem base de impostos" (Anexo 12)
ou "sem recurso do FUNDEB" (Anexo 8). O Anexo 8 não tem indicador próprio do mínimo de 25% em MDE —
só a linha 5 (mínimo além do FUNDEB) —, e por isso o mesmo padrão só existia no indicador dos 70%.

## A composição das linhas do Anexo 12, do Anexo 13 e da DFC (V33)

A pergunta do contador é "de que documentos é feito este número?". A resposta não é uma consulta ao
lado dos motores, porque seria a segunda aritmética da demonstração. As linhas documento a documento
moram em `composicao.ts`, e os três motores SOMAM a partir delas:

| Linha documento a documento | Quem soma | Por |
|---|---|---|
| `parcelasDaReceitaRealizada` (guia × fonte, com sinal) | Anexo 13, Anexo 12, DFC | fonte; natureza; origem |
| `movimentosDeEmpenho` (cada EMPENHO/EMPENHO_ANULADO, com o empenho original) | Anexo 13 | fonte |
| `execucaoPorEmpenho` (liquidado e pago pela régua dos estornáveis) | Anexo 12 | ficha |
| `restosPagosNaJanela` (pagamento e estorno de RP de exercício anterior) | Anexo 13, DFC | tipo; grupo |

O empenhado do Anexo 12 continua no `switch` exaustivo dos movimentos de dotação, que também apura
dotação e créditos. A composição desse número usa `movimentosDeEmpenho` com o mesmo filtro, e o teste
de propriedade confere os dois.

A tela (`/relatorios/demonstracoes/composicao?linha=...`) abre pela fonte do Anexo 13, pelo código da
categoria, origem ou grupo do Anexo 12 e pelo rótulo da linha da DFC (`LinhaDfc.composicao`). A porta
confere a soma contra a linha do motor (`Money.equals`). Se o motor recusar (sem rol de caixa, DFC que
não fecha), os documentos aparecem assim mesmo, com o motivo.

Prova: `m12-composicao.test.ts`, com N=2 em cada eixo e dois exercícios. A propriedade cobre toda
linha com documentos. A aritmética manual pega o erro de sinal no leitor comum, que a propriedade não
veria. Quatro mutações acusam (origem, liquidado/pago, restos pagos, raiz da parcial).

Achado ao escrever o teste: o encerramento (M08) inscrevia a anulação parcial do empenho como resto a
pagar próprio, e o Anexo 13 do exercício encerrado não fechava contra o caixa. Correção e
caracterização no M08 (`m08-encerramento-parcial.test.ts`).

**Mudança de comportamento declarada (V33):** o Anexo 12 e a DFC passaram a ler a receita pelas
parcelas de fonte de cada guia (`parcelasDaGuia`). Uma guia cuja distribuição não soma o total agora
derruba os dois relatórios com "DISTRIBUIÇÃO INCONSISTENTE", nomeando a guia. Antes eles somavam pelo
valor da guia e não viam o defeito; o Anexo 13 já recusava. É fail-closed e é a mesma recusa nos três.
A escrita (motor de partidas e `distribuicao.ts`) já impede essa guia; a recusa cobre importador,
manutenção e caminho futuro.

## V35 — os de-paras da LRF pelo ementário 2026 e a dedução do FUNDEB na RCL

- `deparas-pelo-ementario.ts` (`gerarDeParasDaLrf`, CADASTRAR_LINHA_DEMONSTRATIVO): os seeds de RCL, base de impostos
  e FUNDEB listavam códigos de ementários antigos (IPTU 11180111, FPM 17210151) inexistentes em 2026; com a base real
  quase toda receita caía em "Outras". As regras agora são prefixos dos agregadores oficiais de 2026 (o MDF 15ª ed.
  define cada linha pelo conceito que o agregador cobre) aplicados às naturezas cadastradas; só acrescenta. IR de
  qualquer espécie é IRRF para município (CF art. 158, I). Classes de fonte (saúde, educação) pela tabela da STN.
- RREO Anexo 3: a previsão da dedução do FUNDEB (tipo 3) e a dedução registrada vão à linha própria da II; a receita
  da natureza fica bruta na I.
- Os seeds antigos (`m12-depara-rcl`, `m12-asps-deparas`, `m12-mde-deparas`) ficam para a demonstração; uma base real
  usa o gerador.

## V35 — Anexo 16, Anexo 17 e o termo de conferência de caixa (prestação de contas anual)

`demonstrativos-da-pca.ts`. Os três estão no rol do TCE-PB (`docs/oficial/tce-pb/PCA-ROL-RN-TC-03-2010.md`). Leitura
pura e composta: nenhuma soma nova sobre o fato.

- **Anexo 16 (Lei 4.320, art. 98).** Por dívida do M10: saldo anterior, contratação, atualização, amortização, saldo
  seguinte, pelo dia civil do movimento. O estorno fica na coluna do movimento que estorna. **Interna ou externa sai do
  nome da conta de passivo no plano**, subindo pelos pais ("EMPRÉSTIMOS INTERNOS", "... - EXTERNO"), e nunca do
  documento do credor. Conta sem nenhum dos dois termos na cadeia: recusa nomeando a dívida. O saldo seguinte total é
  conferido contra Σ(valor × SINAL) até 31/12; se divergir, o demonstrativo não sai.
- **Anexo 17 (art. 92).** Restos a pagar pelo `restosParaAnexo7` do M08, a mesma fonte do RREO Anexo 7:
  - saldo anterior: abertura das inscrições de anos anteriores;
  - baixa: pago e cancelado no ano;
  - inscrição: as inscrições com `exercicioOrigem == ref`, lidas pelo recorte de ref+1.
  - **Serviço da dívida a pagar** (inciso II): restos dos grupos 2 e 6. Para isso entrou `grupoDaDespesa` em
    `InscricaoParaAnexo7` (campo aditivo).
  - **Depósitos** (inciso III): analíticas de `2.1.8.8.` (valores restituíveis).
  - **Débitos de tesouraria** (inciso IV): a conta de passivo cujo nome é "ANTECIPAÇÃO DA RECEITA ORÇAMENTÁRIA".
  - Nos incisos III e IV, crédito no ano é inscrição e débito é baixa, pela data do fato.
- **Termo de conferência de caixa.** É a `conciliacaoBancaria` de cada conta bancária em 31/12, com a contagem das
  linhas de extrato ("sem extrato": o banco não foi conferido) e das pendências.
  - As disponibilidades de `1.1.1.` que não são contábil de conta bancária nenhuma (o caixa em espécie) saem à parte.
  - `naoAtribuido` fecha contra o total de 1.1.1 no razão.
  - Conta bancária sem conta contábil: recusa nomeada.

Tela, PDF e CSV saem das mesmas tabelas (`lib/relatorios/tabelas-da-pca.ts`), em Relatórios › Demonstrações.
Teste: `m12-demonstrativos-da-pca.test.ts`. Fixture de duas dívidas, quatro inscrições de dois grupos e dois anos, e um
dia civil de borda. As negações afirmam o motivo.

## V35 C2 — notas explicativas às DCASP

`notas-explicativas.ts`. Fonte: MCASP 11ª ed., Parte V, item 8. Tela: `/relatorios/demonstracoes/notas-explicativas`
(PDF). Escrita sob CADASTRAR_LINHA_DEMONSTRATIVO; leitura sob CONSULTAR_RELATORIOS.

- **Quatro seções, na ordem de 8.2:** informações gerais; políticas contábeis; detalhamento dos itens; outras
  informações. A numeração é corrida, para a referência cruzada com os quadros.
- **O ente redige.** Cada nota é versionada e append-only (`NotaExplicativa`): revisar grava a versão seguinte da
  chave, retirar grava uma versão `retirada`. Vale a de maior versão.
- **Temas obrigatórios.** Os que o manual manda divulgar (8.2.4 a, b, c; 8.2 a iv; 8.2.1 a) e ainda não têm nota saem
  como pendência na tela e no PDF. Cada tema tem a sua seção, e a nota em outra seção é recusada.
- **O sistema escreve o que já sabe**, lido na hora e com a origem:
  - identificação (`EnteConfig`);
  - depreciação, amortização e exaustão por classe (`parametroVigenteEm` de dezembro);
  - metodologia do ajuste para perdas (Parte III, 5.2.5 manda divulgar);
  - parâmetro das férias;
  - a última apuração do ajuste no exercício, por origem.
- Teste `m12-notas-explicativas.test.ts`, 3 testes. Mutações provadas vermelhas: a versão vigente pela menor versão,
  e a lista de pendências sem filtro.
