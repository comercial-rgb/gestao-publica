# RREO Anexo 6 — Resultado Primário e Nominal, ACIMA DA LINHA (7.8-a)

LRF art. 53, III. Mede se o ente se paga **antes** de contar a dívida. Se o primário é
negativo, o município fecha o período tomando dívida nova para custear-se — e nenhum
superávit contábil desmente isso.

## A armadilha da dupla contagem do RP — o t3

`XXIV = XII(a) − [XXIII(a) + XXIII(b) + XXIII(c)]`: pagas **mais** RP processados pagos
**mais** RPNP pagos. Só que o M08 grava o pagamento de um resto a pagar como um
`Pagamento` **de verdade**, e `despesaPorFonte` (M05) avisa que toda linha de `Pagamento`
cai na varredura dela — lá isso é correto, porque o caixa da fonte não distingue de que
ano é o cheque.

Aqui seria fatal: o mesmo cheque entraria em (a) e em (b)/(c), e o resultado sairia
deficitário pelo valor de cada RP pago. A separação é **estrutural**, não um filtro de
conveniência: `Pagamento → Liquidacao → Empenho → Ficha.exercicio`. O pagamento de RP
pendura na liquidação do empenho **antigo**, cuja ficha é de exercício anterior.
`execucaoPorGrupoNd` filtra `ficha.exercicio` e por isso não vê RP; `rpPagosPorGrupoNd` lê
os movimentos e por isso não vê o exercício corrente. Cada cheque, uma gaveta.

É a mesma família de erro que o `exercicioOrigemAte` resolveu na 7.5: um fato que cabe em
duas gavetas é contado nas duas, a menos que alguém escolha. O t3 trava a coluna (a) e o
resultado — e o `not.toBe("490000.00")` é a prova de que o bug produziria um total que
**fecha**, e por isso ninguém veria.

## Os leitores que nasceram, e por que não eram cópia

O padrão de colunas do Anexo 6 já existia **três vezes**, sempre privado dentro do arquivo
de um anexo (`rreo-anexo1`, `rreo-anexo11`, `rreo-anexo12`), cada um acoplado ao seu
filtro. A quarta cópia seria a que divergiria. Nasceram dois leitores públicos:

- `execucaoPorGrupoNd` (M05) — as quatro colunas orçamentárias por `(grupo, elemento)`.
- `rpPagosPorGrupoNd` (M08) — as colunas (b) e (c), **agregando `totaisDosMovimentos`**,
  cujo `pagoLiquido` já é "o que de fato saiu do caixa". Zero aritmética nova; o docstring
  daquela função já previa este chamador ("o M12 lê os movimentos ATÉ UMA DATA DE CORTE e
  chama a MESMA função").

A chave é `(grupo, elemento)` e não só grupo porque o layout tira da primária a **concessão
de empréstimos**, que é elemento (66) dentro de grupo primário. Agrupar depois é barato;
desagregar é impossível.

`m08 → m05` (o `chaveNd`) não fecha ciclo: `m05/consultas` importa `m08/dominio`, e
`m08/restos.ts` já importava `m05/guard-fonte.js`. Recopiar o `${g}|${e}` faria as duas
parcelas do Anexo 6 caírem em linhas diferentes no dia em que uma delas aprendesse um caso
novo — e o total continuaria fechando.

## Decisão 0.5 (A) — os tipos 2 e 4 são primários, por direito

Multas e juros de mora tributários (8º dígito 2 e 4) são **acessórios do tributo**: seguem
o principal, e o principal é primário. A dedução de financeiras nas correntes é, no MDF,
essencialmente rendimento de aplicação. Não é viés tolerado — é a leitura da norma.

E ainda que se discordasse, não haveria como fazer diferente: **o 8º dígito não separa o
juro da multa**. `11121102` é "IPTU — multas E juros de mora", um código só. Ratear por
proporção seria inventar dado.

## A estrutura classifica; o rol só entra onde ela não alcança

O dono de "o que é esta natureza" já existe e é fail-closed: `parsearNaturezaReceita`
(M04). Categoria e origem saem dele — operação de crédito é financeira por ser **origem
21**, não por estar numa lista que alguém precisa lembrar de atualizar. Uma natureza nova
nasce classificada.

Só a **origem 13** precisa de rol: ela mistura rendimento de aplicação (financeiro) com
aluguel e concessão (primários). `RENDIMENTOS_DE_APLICACAO` tem os dois códigos que
existem no censo. Um código 13 **fora** do rol vira interruptor, não "demais correntes":
é precisamente ali que mora a ambiguidade, e chutar primária inflaria o resultado em
silêncio.

⚠️ **Não consumimos o `PAPEL_RENDIMENTOS`** do de-para do FUNDEB: aquele mapa identifica
os rendimentos *do FUNDEB*, recorte próprio e menor. Não é dono de "quais naturezas são
rendimento" em geral — usá-lo deixaria de fora todo rendimento fora do FUNDEB e amarraria
o Anexo 6 a uma decisão de educação.

## Os interruptores nomeados

- **`JUROS-ATIVOS-XXV`** — o XXV mede juros de **haveres financeiros** (empréstimos
  concedidos etc.), que o censo não tem. Sai `null`, **não "0,00"**: zero afirmaria que o
  ente não recebeu juros; o que sabemos é que não temos como saber. E o XXVII calculado
  com XXV = 0 sairia menor que a verdade, faltando uma parcela positiva que ninguém veria
  faltar. Por isso o XXVII também é `null`.
- **`SEM-SEGREGACAO-RPPS`** — o cabeçalho pede "correntes exceto fontes RPPS".
  `FonteRecurso` não tem classe de fonte; "é do RPPS" só é dado do lado da **despesa**
  (`UnidadeOrcamentaria.tipoManad`, `Acao.tipoProjAtivManad`, códigos MANAD 05/07). As
  correntes entram inteiras, e a direção do erro (receita primária para mais) está dita.
- **`META-FISCAL-LDO`** — sem entidade de meta fiscal (PPA/LDO/LOA são pendência do M02b).
  Mostra o resultado e **cala** (doutrina do IEI, 7.6-b): publicar "meta: 0,00" faria
  qualquer resultado positivo parecer cumprimento. ⚠️ Não confundir com `MetaMba`, que
  existe e é meta **bimestral de arrecadação** (programação financeira, TR 4.18): usá-la
  aqui compararia resultado primário contra meta de receita.
- **`SEM-ALIENACAO-DE-INVESTIMENTOS`** — o layout separa alienação de bens **operacionais**
  (primária) de alienação de **investimentos** (não primária). Só existe o eixo
  móveis/imóveis/intangíveis (`DeParaReceitaAlienacao`), e os três são operacionais.
  Títulos e participações não são modelados; quando o M10 os modelar, a classificação
  desce e a linha se parte em duas.
- **`ORIGEM-29-SEM-CLASSIFICACAO`** / **`RECEITA-INTRA-NO-PRIMARIO`** — o layout não as
  classifica. A intra é o ente pagando a si mesmo (tipicamente a patronal do RPPS, o que o
  cabeçalho manda excluir); a 29 é literalmente "o que não coube" e pode misturar as duas
  naturezas. As não classificadas aparecem na tela, com o motivo e o valor: um número que
  sai da conta tem de aparecer em algum lugar.
- **`ELEMENTO-TITULO-JA-INTEGRALIZADO`** — o layout tira "aquisição de título de capital
  **já integralizado**". O elemento 65 do censo é "Constituição ou Aumento de Capital de
  Empresas", que **não é a mesma coisa**: aporte ≠ permuta de ativo. O desdobramento vive
  no subelemento, que não tem seed (`Empenho.subelementoId` é nullable por isso). Só o 66
  (concessão de empréstimos) é excluído — ali o nome bate exatamente.
- **`GRUPO-ND-9-SEM-CLASSIFICACAO`** — a Reserva de Contingência tem dotação e nunca
  execução. Somá-la à despesa primária inflaria a dotação de uma linha que jamais vira
  caixa.

## O Badge não julga

Superávit primário **não é "bom"** e déficit não é "ruim": um ente investindo pesado com
caixa poupado tem déficit primário e está certo. O Badge diz **o que é**; quem julgaria
seria a comparação com a meta — justamente a que não temos.

## O que a fixture do teste teve de contornar

- **`MAPA-ELEMENTO-CONTA`** — o grupo 2 deveria usar o elemento 21 (Juros sobre a Dívida
  por Contrato). Ele não tem roteiro de liquidação: o rol de `contrapartidaDaLiquidacao`
  cobre 30, 39 e 71. A fixture usa 39, cuja contrapartida (VPD) é a semanticamente correta
  para juros — juros são despesa incorrida, não viram ativo. A classificação lê o **grupo**,
  então o XXVI é exercido fielmente. Fechado o mapa, troca-se 39 por 21 e nada mais muda.
- **A fila do art. 141 (M06)** — cada fluxo tem par (fonte, categoria) próprio. A fila é
  por fonte × categoria e uma liquidação antiga **parcialmente paga continua na cabeça
  dela**; como quase todo fluxo aqui paga parcial (é o que produz liquidada ≠ paga),
  pô-los na mesma fila faria o M06 recusar o segundo pagamento — corretamente. A fonte não
  é eixo deste anexo (ele agrupa por grupo|elemento), então separar as filas não mexe em
  número nenhum. A alternativa seria justificar quebra de ordem numa das hipóteses
  taxativas do §1º — inventar emergência para fazer fixture passar, que é maquiar o guard.

## Abaixo da linha (7.8-b) — feito, e o que ele revelou

O resultado nominal medido pela **variação da DCL** entre dois cortes (`rreo-anexo6-abaixo.ts`),
harmonizado com o acima. Convenção de sinal (registrada, MDF 15ª/Siconfi): **nominal =
DCL(inicial) − DCL(final)**; DCL que cai = superávit. Corte inicial = 31/12 do exercício
anterior; corte final = fim do bimestre. Publica em **todos** os bimestres — os três primitivos
da DCL (`saldoDaDividaPorTipo`, `rgfAnexo5`, `restosAPagarPorFonte`) já aceitam corte arbitrário,
então não há interruptor `CORTE-NAO-QUADRIMESTRAL`. A aritmética da DCL virou **`dclNoCorte`** em
`rgf-anexo2.ts` — dono único; o `medirColuna` e o abaixo-da-linha a chamam, ninguém a recopia.

### A identidade só fecha SEM juros, e é isso que o espelho do XXV diz

A harmonização que o brief pedia — `nominal-abaixo == XXVII`, `primário-abaixo == XXIV` — **não
fecha literalmente**, porque o **XXVII é `null`** (o XXV é interruptor). Os dois lados viram
"concreto == null". O que É verdade é o par cruzado:

- **acima** dá o **primário** concreto (XXIV) e o nominal `null` (XXVII);
- **abaixo** dá o **nominal** concreto (variação da DCL) e o primário `null`.

Cada lado preenche exatamente o furo do outro — e nenhum fecha o número que falta sem o XXV. Num
cenário **sem juros e sem ajustes**, nominal ≡ primário, e aí `nominal-abaixo == XXIV`. É o que a
**fixture LIMPA** (`m12-rreo-anexo6-abaixo.test.ts`) prova: 300.000 dos dois lados, `diferenca = 0`.
**Não relaxamos o interruptor** (dar 0 concreto ao XXV afirmaria que não houve juros ativos; o que
sabemos é que não temos como saber).

### A fixture 7.8-a DIVERGE — e a divergência é NOMEADA, não fechada

Sobre a fixture do acima-da-linha (com juros e RP), os dois caminhos divergem em **12.000**
(`nominal-abaixo = 542.000`, `XXIV = 530.000`), e `fecha = false`. **É esperado**, por três motivos
que o método trata de forma diferente:

1. **Juros (XXVI = 45.000)**: o nominal os sente (sai do caixa → DCL sobe), o primário não.
2. **Pagar RP processado é DCL-neutro**: o caixa cai junto com o passivo de RP → disponibilidade
   inalterada → DCL inalterada. Mas o XXIV **subtrai** o RP pago na coluna (b). O mesmo cheque, dois
   tratamentos.
3. **O piso da nota¹ no corte de abertura**: a disponibilidade de 31/12 foi pisada a zero (RP
   processados > caixa), o que quebra a álgebra linear da variação.

Isolar cada parcela numa equação de reconciliação seria **fechar a divergência à força** — decidido
NÃO fazer (a reconciliação com N termos-ponte quebra a cada mudança de dinâmica da fixture). A
`diferenca` a **mostra**; o `t10` a trava; esta seção a explica. O ajuste `HARMONIZACAO-NAO-FECHA`
sai nas notas do relatório.

### Ajustes metodológicos — um vivo, três parâmetros

Só a **variação monetária da dívida** (`ATUALIZACAO_MONETARIA` do M10) é linha viva: é a única
variação não-fiscal com fato rastreável E sinal inequívoco. Ela **soma de volta** ao nominal (o
passivo subiu por índice, não por déficit) — o `t-ajuste` prova que sem o add-back o nominal sairia
10.000 menor e a identidade quebraria. Os outros três são **parâmetros nomeados** (zero):

- `ALIENACAO-INVESTIMENTOS` — o censo só modela bens operacionais (já são receita primária no XXIV);
  alienação de investimento não existe como fato.
- `DESINCORPORACAO-PASSIVO` — o cancelamento de RP (4.6.4) existe e já move a DCL, mas isolar a
  parcela **não-fiscal** exigiria o discriminador "por insuficiência", que é texto livre (o mesmo
  motivo do `CANCELADOS-POR-INSUFICIENCIA = 0` do RGF Anexo 5). Marcá-lo com sinal seria inventar.
- `RECONHECIMENTO-DIVIDA-SEM-EXECUCAO` — no censo, só a atualização monetária reconhece dívida sem
  execução (já viva). Não há path genérico.

⚠️ **A sessão do ementário entrou ANTES da 7.8-b** (feita na 7.9): o abaixo-da-linha harmoniza contra
números que passam pelos de-paras de receita, e harmonizar sobre mapa não verificado seria construir
identidade sobre areia. Ver `EMENTARIO-RECEITA-DO-ENTE` abaixo.

---

# EMENTARIO-RECEITA-DO-ENTE — o furo que o Passo 0 da 7.8-a abriu

**Não existe cadastro de `NaturezaReceita`.** `prisma/seed/m02-seed-oficial.ts` semeia
função, subfunção e natureza de **despesa** — e só. Toda `NaturezaReceita` do repositório
nasce em fixture de teste.

E a divergência não é de um código, é do mapa inteiro. `depara-rcl-anexo3.ts` (RCL) e
`asps-deparas.ts` (base do Anexo 12) discordam de **três dos quatro** impostos municipais:

| imposto | depara-rcl-anexo3 | asps-deparas | |
|---|---|---|---|
| ITBI | `11120111` | `11120111` | ✓ o único acordo |
| IPTU | `11130111` | `11121101` | ✗ |
| ISS | `11140111` | `11180111` | ✗ |
| IRRF | `11180111` (removido na 7.8-a) | `11180311` | ✗ |

Os dois foram construídos independentemente, cada um contra as fixtures que tinha à mão —
e cada um anota isso no próprio comentário ("o IPTU dos fixtures", "o código dos
fixtures"). O `11180111` só saltou aos olhos por ser o único código que **colide** nos dois.

**Por que ninguém percebeu: nenhum teste importa esses arquivos.** Os seeds de de-para são
consumidos só por script avulso (`npx tsx prisma/seed/m12-depara-rcl.ts`). O R3 do Anexo 12
— que existe justamente para confrontar o IPTU entre os dois de-paras — cria o próprio
de-para na fixture (`m12-rreo-anexo12.test.ts:143`, com `11121101`) e nunca olha para lá.
**De-para de produção sem consumidor testado é dado que ninguém verifica**; foi assim que
os dois divergiram.

## O que a 7.8-a fez (F0-mínima) e o que deliberadamente NÃO fez

Removeu **só** `11180111 → IRRF` do `depara-rcl-anexo3.ts`: a única afirmação provada falsa
(o ementário oficial dá IRRF = `11130311`, código que não existe em lugar nenhum deste
repositório). A linha IRRF do Anexo 3 ficou em `LINHAS_SEM_NATUREZA_ANEXO3` — interruptor
nomeado. **Não herda código alheio.**

Não remapeou nada mais. Mapear `11180111 → IPTU` seria **inferir**: a `descricao` de uma
fixture não é o ementário do ente, ainda que três fixtures independentes o chamem "IPTU —
principal" e seis arquivos o chamem `NAT_IPTU`. Remapear os outros três seria reconstruir
o mapa de memória — o que o cabeçalho do próprio arquivo proíbe, citando a lição das
subfunções ("10 erros ao reconstruir à mão"). E corrigir só o `11180111` deixaria o `asps`
**sem nenhum ISS** e os dois mapas ainda discordando sobre IPTU e ISS: não é correção, é
uma mentira nova no lugar de uma velha.

⚠️ **O seed não retrata**: `m12-depara-rcl.ts` é upsert-only, sem delete. Num banco que já
rodou o seed antigo, `11180111 → IRRF` **continua gravada** — tirá-la da lista não a apaga
de lá. O script agora lista as linhas órfãs (as que estão no banco e não na lista), mas não
as apaga: remoção em banco povoado é ato deliberado, com identidade e trilha.

## O que a sessão do ementário tem de fazer

1. Refazer os **dois** de-paras contra o ementário oficial do ente.
2. Criar o teste que falta: **os dois de-paras concordando sobre cada imposto, sobre o SEED
   de produção** — não sobre fixtures. É o R3 que deveria existir e não existe.
3. Decidir o que fazer com as linhas já gravadas em banco povoado.
