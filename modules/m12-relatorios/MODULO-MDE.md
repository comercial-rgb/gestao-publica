# RREO Anexo 8 — MDE (Educação) · decisões registradas

O motor ([rreo-anexo8.ts](rreo-anexo8.ts)) apura o mínimo de 25% em educação (CF art. 212) e o
FUNDEB (art. 212-A). As receitas vêm do **motor de base compartilhado** ([base-impostos.ts](base-impostos.ts))
— o mesmo do Anexo 12 —; a diferença é a **repartição**. Duas decisões não-óbvias ficam aqui.

## 1. Os grupos 20%/25% são CONFIG por chave (não por número de linha)

A apuração parte de dois grupos de receita:
- **G20** (base do FUNDEB, destina-se 20%): FPM (parcela art. 159 I-b), ICMS, IPI-Exportação, ITR,
  IPVA, Outras/Compensações.
- **G25** (além do FUNDEB, aplica-se 25%): IPTU, ITBI, ISS, IRRF, FPM (complementações 1%), IOF-Ouro.

`Linha 4` (Total Destinado ao FUNDEB) = 20% × Σ(G20). `Linha 5` (Mínimo Além) = 5% × Σ(G20) + 25% × Σ(G25).

A pertinência de cada receita a um grupo mora em `LINHAS_RECEITA_MDE` (config por **chave estável**,
não por número de linha) — a renumeração da 15ª ed. entra por editar a tabela, nunca o motor.

> **⚠️ PENDÊNCIA DE DADO NOMEADA (grupo do 2.7):** a 12ª/13ª ed. tratava "Outras Transferências e
> Compensações" (2.7) no grupo dos 25%; a **14ª** as moveu para a base do FUNDEB (grupo 20%). O
> motor adota **G20** (14ª/15ª) e emite **nota no demonstrativo**. A conferência definitiva contra o
> xlsx oficial da 15ª ed. é pendência de dado — quando confirmada, é uma linha na config.

## 2. A linha 4 é CALCULADA; a dedução registrada pode divergir

`Linha 4` é **20% da base** (um cálculo). A dedução do FUNDEB efetivamente **registrada** no razão
(a natureza redutora `DED_FUNDEB`, cf. Anexo 12) pode **divergir** desse cálculo — a própria nota
oficial da STN admite a diferença, e o leiaute não tem campo para explicá-la.

**Decisão:** o demonstrativo mostra a **calculada** (o valor normativo). A identidade R4 dos testes
usa um fixture com a dedução construída **exata** (dedução registrada == linha 4) — é uma
**identidade de fixture, não um guard**: em produção a divergência é legítima e não deve travar nada.

## 3. FPM 2.1.1 × 2.1.2 e as receitas do FUNDEB — fail-open nomeado

Não há natureza distinta para as complementações de 1% do FPM (2.1.2). A linha nasce de uma **chave
própria** (`FPM_COMPLEMENTACAO`) com de-para vazio: sem natureza mapeada, 2.1.2 = 0,00 com nota —
**nunca um rateio inventado**. As receitas do FUNDEB (6.1-6.4) e o superávit anterior (8) seguem o
mesmo padrão de tabela-parâmetro nomeada.

## 4. Profissionais da educação e a regra dos bimestres

O indicador de 70% (art. 212-A XI) mede a remuneração dos **profissionais da educação básica** —
derivada por **elemento {04, 11, 13, 16}** na função 12 com fonte de classe FUNDEB (rol fechado;
elemento novo = fronteira nomeada). O acompanhamento das despesas segue a **nota 5 do modelo**:
bimestres 1-5 pela **liquidada**, 6º pela **empenhada** (mesmo padrão do Anexo 1) — parâmetro
derivado do bimestre, não hardcode.

O **fail-closed** vale para a fonte: uma despesa da função 12 com fonte sem classe de educação
mapeada (`DeParaFonteClasseEducacao`) faz o gerador **parar nomeando a fonte** — o mínimo de 25% e o
indicador de 70% são limites constitucionais.

---

# Bloco 2 — o diferimento do art. 25, §3º (7.6-a)

`mde-diferimento.ts` + a seção "Diferimento" na página do Anexo 8.

## A regra

Os recursos do FUNDEB são para o exercício em que foram creditados (art. 25, caput). O
§3º abre **uma exceção estreita**: até **10%** dos valores recebidos podem ser usados no
**1º quadrimestre** do exercício seguinte, **mediante abertura de crédito adicional**. Ao
final do exercício, as disponibilidades — inclusive as que cobrem restos a pagar —
**permanecem em conta vinculada**.

## Zero aritmética nova

`recebido` é a linha 6 do bloco 1 (`totalRecebidoFundeb`); `aplicado` é a linha 10
(`despesaFundebTotal.acompanhamento`), que já carrega a regra bimestral. O motor consome
`anexo8(prisma, { exercicio, bimestre: 6 })` — o retrato de 31/12, que é o que o §3º
pergunta. Recalcular seria a segunda verdade sobre o mesmo FUNDEB.

## ⚠️ O motor NÃO trunca

Se o não aplicado passa dos 10%, o número sai como é e a linha acusa (`estourou` +
`excesso`). Limitá-lo ao teto — "o ente diferiu 10%" — esconderia a irregularidade
justamente de quem a fiscaliza: o excesso não vira diferimento legal por ser reescrito,
ele vira **glosa**.

## ⚠️ R-DIF é identidade de FIXTURE + nota, **não guard**

> R-DIF: `naoAplicado ≤ disponibilidade líquida (i)` da fonte no Anexo 5, em 31/12.
> Informativo, não guard: o Anexo 8 é **bimestral** e o Anexo 5 é **quadrimestral** — só
> no fim do exercício ambos olham o mesmo instante. E é `≤`, não `==`: a fonte pode ter
> superávit anterior.

Um guard aqui derrubaria o relatório de abril por uma diferença que a norma prevê.

**A álgebra diz por que os dois batem** quando o empenhado é todo liquidado e não há RP:

```
(i) = (arrecadado − pago) − (liquidado − pago) = arrecadado − liquidado = naoAplicado
```

São o mesmo dinheiro visto de dois subsistemas. O `m12-mde-diferimento.test.ts` prova
com a fixture combinada — 300.000 recebidos, 280.000 aplicados, 20.000 dos dois lados.

## A fixture combinada (o trabalho da sessão)

Ela fecha para **dois leitores ao mesmo tempo**: o `anexo8` e o `rgfAnexo5` — cuja
amarração S1 do `superavit-por-fonte` derruba se houver dinheiro sem fato de origem. Por
isso usa o **plano de produção** (`semearPcasp`) e os **roteiros do M01**, não os legados
do M05 (que não movem a DDR e inventam as próprias contas). É o mesmo elo que o
`m16-borda-execucao` estabeleceu na 7.3.

## A janela, por dois cortes do mesmo leitor

`pagoBruto` até 30/04 do seguinte **menos** `pagoBruto` até 31/12. A diferença é, por
definição, o que aconteceu no meio. Sem leitor novo, e **pela data do fato** (doutrina do
`campoData`): um pagamento de 30/04 lançado em maio pertence a abril, e é abril que a lei
nomeia. O t4 prova o limite: 01/05 já não conta.

`null` quando a janela não teve movimento — melhor dizer "não houve" do que exibir 0,00 e
deixar o leitor achar que o ente diferiu e não aplicou.

## Pendências

- **`CREDITO-ADICIONAL-DIFERIMENTO`**: o §3º exige crédito adicional para usar o
  diferido. O M03 **não tem leitor de créditos por fonte** — a página diz isso em vez de
  inventar o vínculo.
- **7.6-b** (fora desta sessão): VAAT 15% capital (`codCategoria = "4"`), VAAT educação
  infantil (subfunção 365 + `IEI-MUNICIPIO` como tabela-parâmetro vazia), rateio por
  áreas (`MATRICULAS-POR-AREA`), e os controles RP × lastro lendo (b)+(d) do Anexo 5.

---

# Bloco 2 — FECHADO (7.6-b): VAAT, áreas de atuação e RP × lastro

`mde-vaat.ts` + as seções novas na página do Anexo 8. Lei 14.113/2020, arts. 27 e 28.

## O VAAT tem regra própria porque é socorro

A complementação-VAAT é dinheiro que a União põe onde o valor por aluno ficou abaixo do
mínimo. Por ser socorro, vem com destino: **≥15% em despesas de capital** (art. 27) e uma
fatia em **educação infantil** (art. 28). Gastá-la em custeio corrente é usar o socorro
para pagar a conta de sempre.

- **Capital**: `codCategoria = "4"` na natureza da ficha, fonte de classe VAAT, regra
  bimestral do bloco 1.
- **Educação infantil**: subfunção **365**, mesma regra.

## ⚠️ Os 50% do art. 28 NÃO são a obrigação do município

O art. 28 manda 50% da complementação-VAAT **global** à educação infantil. Esses 50% são
da **distribuição nacional**. O percentual de cada ente é o seu **IEI** (Indicador de
Educação Infantil), publicado até 31/12 pelo Executivo Federal (art. 28, § único, c/c
art. 16, VII).

Comparar o município contra 50% inventaria uma obrigação que a lei não lhe deu — e
reprovaria um ente que cumpriu o IEI dele. Sem o número publicado, o motor **mostra o
apurado e não compara**: `minimo: null`, `atingiu: null`, interruptor `IEI-MUNICIPIO`.

## ⚠️ Base zero não é 0%

Sem complementação-VAAT no exercício, o mínimo do art. 27 **não se aplica**. Exibir
"0,00%" diria que o ente descumpriu um mínimo que não lhe foi imposto — e é a divisão por
zero que produziria esse 0%. Interruptor `SEM-VAAT-NO-EXERCICIO`; `percentual: null`.

## A medição tem um dono

`medirDespesa` (a regra bimestral — liquidada nos bimestres 1-5, empenhada no 6º, nota 5
do MDF) foi **exportada** do `rreo-anexo8.ts` para o bloco 2 reusá-la. Uma segunda medição
no `mde-vaat.ts` divergiria dela no primeiro estorno, e os dois quadros do mesmo anexo
passariam a discordar sobre a mesma despesa.

## RP × lastro — por fonte, nunca pelo total

O art. 25, §3º *in fine* manda as disponibilidades — **inclusive as que cobrem restos a
pagar** — permanecerem em conta vinculada. Inscrever RP de educação sem deixar o dinheiro
na conta é contar como aplicado um gasto que o ente não pode honrar: o mínimo cumprido no
papel e não no caixa.

O confronto é por **fonte**: RP inscrito ((b)+(d) do Anexo 5) contra o caixa bruto ((a)).
O excesso é `semLastro` — e é glosa. Por fonte porque o dinheiro da educação é carimbado:
um superávit na fonte livre não lastreia o RP do FUNDEB, pela mesma razão que o Anexo 5 é
por vinculação.

## Os dois parâmetros que faltam, e o que cada um destrava

| Parâmetro | O que destrava | Quem publica |
|---|---|---|
| **`IEI-MUNICIPIO`** | a comparação do indicador de educação infantil (art. 28). Hoje o motor apura e não compara. | Executivo Federal, até 31/12 (art. 16, VII) |
| **`MATRICULAS-POR-AREA`** | o rateio da despesa de educação que nenhuma subfunção de ensino identifica (a administração da secretaria). Hoje ela fica em `naoRateado`, coluna própria e visível. Nota 6 do MDF. | censo escolar do ente |

⚠️ Quando `MATRICULAS-POR-AREA` chegar: rateio com **`ROUND_DOWN` e o resto na última
área** (a doutrina de divisão do repo) — senão a soma das partes não fecha com o todo.

## Outras pendências

- **`DESDOBRAMENTO-CRECHE-PRE-ESCOLA`**: a subfunção 365 é nível único no rol oficial
  (Portaria 42/1999). Creche e pré-escola não se distinguem, e nenhum outro campo o faz.
- **Conferência contra o xlsx da 15ª edição**: segue pendente, como no bloco 1.
