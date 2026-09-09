# M07 — extraorçamentário (consignações, retenções e cauções)

**Lei 4.320/64, arts. 3º e 103; MCASP (ingressos e dispêndios extraorçamentários).**
Status: **concluído** (blocos 1, 2 e 3).

## O conceito, numa frase

**Dinheiro de TERCEIROS transitando pelo caixa: entra sem ser receita, sai sem ser
despesa.** O INSS retido do fornecedor nunca foi do município — ele só passa pela
conta bancária dele a caminho da Receita Federal. A caução do licitante idem.

Consequência que atravessa o módulo inteiro: **nenhuma operação daqui cria
`MovimentoDotacao`, e nenhum roteiro daqui tem perna orçamentária.** Uma perna
orçamentária aqui inflaria a execução com dinheiro que não é do ente.

## Invariantes

1. **Decimal(18,2). APPEND-ONLY** em tudo. Sem `updatedAt`, sem `deletedAt`.
   Correção = registro NOVO com `estornoDeId`.
2. **NÃO TOCA O ORÇAMENTO.** Zero `MovimentoDotacao`, zero perna `ORCAMENTARIO`,
   zero entrada na fila do art. 141. Testado: as operações comparam a tabela
   `MovimentoDotacao` inteira antes/depois e exigem que seja idêntica.
3. **O `valor` é SEMPRE positivo — quem dá o sinal é o TIPO** (`SINAL_MOVIMENTO_EXTRA`).
   Não existe movimento com valor negativo escondendo um estorno.
4. **O SALDO É POR `(tipoConsignacao, credorConsignatario)`, e sai de SUM.** Nunca
   de coluna. O saldo do INSS não paga a pensão da Maria.
5. **FAIL-CLOSED:** não se repassa o que não se reteve; não se retém em tipo
   inativo; não se estorna duas vezes.

## ⚠️ OS QUATRO TIPOS NÃO TÊM O MESMO SINAL — e nasceram juntos

| Tipo | Efeito no saldo | Significado |
| --- | --- | --- |
| `INGRESSO` | **+** | dinheiro de terceiro entrou (retenção, caução) |
| `DISPENDIO` | **−** | foi repassado/devolvido ao dono |
| `ESTORNO_INGRESSO` | **−** | o ingresso não devia ter acontecido |
| `ESTORNO_DISPENDIO` | **+** | o repasse não devia ter acontecido: o ente **volta a dever** |

```
ingressoLiquido  = INGRESSO  − ESTORNO_INGRESSO
dispendioLiquido = DISPENDIO − ESTORNO_DISPENDIO
saldo            = ingressoLiquido − dispendioLiquido   ← o que o ente ainda deve
```

**`SINAL_MOVIMENTO_EXTRA` (`dominio.ts`) é a fonte única do sinal**, e **toda** soma
passa por `totaisPorConsignatario()`. Nenhum `SUM(*)` cru.

**Esta é a lição do M08, aplicada preventivamente.** Lá os estornos chegaram
*depois*, e dois `SUM` brutos escaparam: o estorno passou a **reduzir** o saldo em
vez de devolvê-lo (`345af7d`), e o mesmo erro se repetiu no outro tipo (`4768cff`).
Aqui os quatro tipos existem **desde o dia 1**, e o `Record<TipoMovimentoExtra, …>`
faz o TypeScript apontar quem esquecer de tratar um tipo novo. **Feature sem
estorno é assimetria com prazo para virar bug.**

## Blocos 1 e 2 — o razão avulso

- `registrarIngressoExtra` — caução, depósito. `D disponibilidade / C consignação a pagar`.
- `registrarDispendioExtra` — repasse ao consignatário (a GPS do INSS), devolução da
  caução. `D consignação a pagar / C disponibilidade`. **TR 5.23** vale aqui:
  a fonte tem de casar com a da conta bancária.
- `estornarMovimentoExtra` — simétrico, serve para os dois. Um estorno **não se
  estorna** (`tipoDoEstorno` barra).

## Bloco 3 — RETENÇÃO NA FONTE: o lançamento COMPOSTO

**Pagar 1.000 ao fornecedor retendo 100 de INSS não são dois fatos: é UM.** O
dinheiro do INSS nunca chega ao fornecedor — ele fica no caixa, mas já não é do
ente. Um único lançamento:

```
PATRIMONIAL   D obrigação a pagar ..... 1.000   ← BRUTO: a obrigação com o
              C disponibilidade .......   900     fornecedor morre INTEIRA
              C consignação a pagar ...   100   ← nasce a dívida com o INSS
ORÇAMENTÁRIO  D crédito liquidado ..... 1.000   ← BRUTO: retenção NÃO é
              C crédito pago .......... 1.000     desconto de despesa
```

- **Só a perna do CAIXA muda de valor** (vira o líquido). Nenhuma outra é deduzida.
- **Uma perna de passivo POR CONSIGNAÇÃO**, nunca uma só somada: o razão é por
  `(tipo, credor)`, e o lançamento espelha o razão. Dois credores do mesmo tipo =
  duas pernas na mesma conta.
- **Quem prova que fecha é o motor do ledger**, sobre o lançamento composto FINAL:
  `ΣD == ΣC` dentro de cada subsistema. Nenhuma aritmética nova foi inventada.
- **As pernas de passivo não têm `fichaId`** — dinheiro de terceiro não é execução
  orçamentária da ficha; ele só transita pelo caixa dela.

**Entrada:** `pagar(input, roteiro, deps, retencoes?)` (M05) e
`pagarRestosAPagar(prisma, input, roteiro, retencoes?)` (M08). **Ausente ou vazio =
caminho idêntico ao de sempre**, partida por partida (há teste puro provando a
identidade com `comporPartidas`).

### BRUTO vs LÍQUIDO — a decisão que sustenta o resto

O `Pagamento` é gravado pelo **BRUTO**. A baixa da inscrição de RP, idem.

**A fila do art. 141 (M06) e o saldo de RP (M08) não sabem que houve retenção — e
não precisam saber.** Registrar o pagamento pelo líquido faria a liquidação **nunca
quitar** (ficaria devendo 100 para sempre), a **fila nunca andar** e o **resto a
pagar nunca zerar** — e o credor apareceria como não pago daquilo que já recebeu.

## Guards da anulação (nasceram no mesmo commit da feature)

O estorno do lançamento **já inverte as pernas de passivo sozinho** (o `gerarEstorno`
inverte todas). Então a contabilidade fecharia sem código nenhum — **e é exatamente
aí que o bug se esconderia**: o razão do M07 continuaria dizendo que o ente deve ao
INSS uma retenção de um pagamento que não existe mais. **Balanço fechado, saldo
mentindo.** É a forma do `345af7d`.

| Guard | Rejeita | Por quê |
| --- | --- | --- |
| **A retenção não se estorna sozinha** (`estornarMovimentoExtra` rejeita movimento com `pagamentoId`) | estornar a retenção por fora | ela divide o **lançamento composto** com o pagamento: estorná-la por lá inverteria o **pagamento inteiro** (caixa, fornecedor, orçamentário) e ainda queimaria o `uq_estorno_unico` do lançamento, deixando a anulação de verdade sem como acontecer |
| **Repasse já feito bloqueia a anulação** (`estornarRetencoesDoPagamento`) | anular pagamento cuja retenção **já foi repassada** | desfazer o ingresso deixaria o saldo do consignatário **NEGATIVO**: o ente teria repassado dinheiro que, no sistema, nunca reteve. O dinheiro real já foi — não volta por anular um registro. **Ordem certa: estorne o repasse, depois anule o pagamento.** |
| **O estorno espelha o original perna por perna** (`espelharFichaDoOriginal`, M05) | estorno com `fichaId` diferente do original | sem ele, as pernas do consignatário (sem ficha) ganhariam ficha no estorno, e a mesma conta apareceria ora com, ora sem |

`anularPagamento` (M05) e `anularPagamentoRestosAPagar` (M08) criam os
`ESTORNO_INGRESSO` **na mesma transação** do estorno do pagamento.

## Direção das dependências

```
M05 (pagar, anularPagamento) ─┐
M08 (pagarRestosAPagar)      ─┴─> M07  (dominio.ts: puro | retencao.ts: recebe a Tx)

M07 NUNCA importa M05 nem M08.
```

`retencao.ts` mora num arquivo **isolado** e recebe a `Tx` de quem paga — mesmo
padrão dos guards do M08. É o que permite os módulos que pagam consumirem o M07
**sem ciclo**.

## Decisões conscientes

- **`TipoConsignacao` é TABELA, não enum.** O rol **não é fechado** — o ente cria
  tipos próprios (plano de saúde, sindicato, associação). Um enum exigiria
  **migração a cada tipo novo**. Por isso o seed também **não tem guard de
  cardinalidade** (é o oposto das subfunções, onde a contagem é o invariante).
- **As contas vêm por PARÂMETRO** (roteiro), como em todo o projeto — inclusive a
  conta de passivo de cada retenção e a `contaDisponibilidade` (qual perna fica com
  o líquido). **Explícita, e não adivinhada do roteiro:** errar qual perna é o caixa
  é errar quem paga a retenção. Não existe conta mágica no código.
- **Retenção duplicada `(tipo, credor)` no mesmo pagamento é REJEITADA.** O saldo é
  por `(tipo, credor)`; duas pernas para a mesma chave tornariam ambígua a anulação.
  Some as duas e mande uma só.
- **O estorno da retenção mantém o `pagamentoId` do pagamento original** — é dele que
  ela veio, e é assim que `estornarRetencoesDoPagamento` e um estorno avulso
  produziriam a mesma linha.

## Pendências

- **O rol oficial de consignações do SAGRES-PB** (token ASTEC) — o seed é
  **mínimo** (`prisma/seed/dados/tipos-consignacao.ts`). Como o rol não é fechado,
  isto **não bloqueia** nada: o ente cadastra o que faltar.
- **`Σretenções == valor do pagamento` é REJEITADO por ora.** Líquido zero deixaria a
  perna do caixa em `0`, e o motor do ledger exige `valor > 0` em toda partida — um
  pagamento que não paga nada ao credor não é pagamento. **Se o TR exigir o caso**
  (ex.: pagamento integralmente consignado), a saída é **omitir a perna de caixa**
  quando o líquido for zero, não relaxar o motor.
- **Motor fiscal (M15):** aqui a retenção é **informada** (quanto, de quem, para
  quem). **Calcular** a alíquota (IRRF, INSS, ISS por tipo de serviço) é o M15.
- **Relatório de consignações a recolher** por competência — provavelmente M12.

## Arquivos deste módulo

- `modules/m07-extraorcamentario/` — `dominio.ts` (puro), `extraorcamentario.ts`
  (ingresso/dispêndio/estorno avulsos), `retencao.ts` (retenção dentro do
  pagamento), `index.ts`, testes `m07-dominio.test.ts`, `m07.test.ts`,
  `m07-retencao.test.ts`.
- `prisma/schema/m07-extraorcamentario.prisma`
- `prisma/seed/m07-tipos-consignacao.ts` + `prisma/seed/dados/tipos-consignacao.ts`

**Tocam o M07 de fora** (por serem quem paga): `m05-despesa/servico-bloco2.ts`,
`m05-despesa/adapter-prisma.ts`, `m05-despesa/ports.ts`,
`m08-restos-a-pagar/restos.ts`.

## Fora de escopo aqui

- **Cálculo** de tributo/alíquota → M15 (retenções / motor fiscal).
- **Conciliação bancária** do dinheiro retido → M09 (financeiro / tesouraria).
- **Guia de recolhimento** (DARF/GPS/GARE) e seus prazos → M15/M17.

---

## `DDR-RETENCAO-CONSIGNACOES` — pendência (nomeada na 7.4)

A 7.4 pôs a DDR (controle da disponibilidade) nos roteiros da execução. No pagamento
**com retenção**, as pernas de controle vão pelo **BRUTO**:

```
D 8.2.1.1.3.01  6.000     (comprometida por liquidação)
C 8.2.1.1.4.01  6.000     (utilizada)
```

...enquanto o patrimonial se divide (caixa 5.100 líquido + consignações 900).

### O refinamento que o espelho oficial pede (TCE-SC)

Existe uma conta a mais — `8.2.1.1.3.02` (**comprometida por consignações/retenções**) —
e com ela o pagamento orçamentário ficaria:

```
D 8.2.1.1.3.01  6.000
C 8.2.1.1.4.01  5.100     (o que de fato saiu ao credor)
C 8.2.1.1.3.02    900     (o retido: comprometido com o consignatário)
```

E o pagamento da **extra** (quitar o consignatário) moveria depois:

```
D 2.1.8.8.x.01 Consignações / C 1.1.1.3.x Valores Restituíveis   (patrimonial)
D 8.2.1.1.3.02              / C 8.2.1.1.4                        (controle)
```

### Por que NÃO foi feito

`comporPagamentoComRetencoes` é explícito e deliberado:

```ts
// Só o CAIXA muda de valor. As demais pernas ficam no BRUTO — nunca deduzidas.
valor: x.conta === p.contaDisponibilidade ? valorLiquido : p.valorBruto,
```

Só **uma** perna recebe o líquido, e há um guard fail-closed logo acima recusando que
ela seja qualquer coisa que não `CREDITO/PATRIMONIAL` — com a razão escrita: *"deduzir o
orçamentário faria a retenção virar desconto de despesa, e a execução passaria a mentir
o valor empenhado"*.

Dividir a perna de **controle** entre líquido e retido exige um segundo conceito de
"conta que recebe o resto" — ou seja, mudar esse motor. Isso é frente do M07, não da
7.4, e a 7.4 declarou este arquivo intocável.

### O que a forma simples custa

A DDR **utilizada** inclui o retido. É **conservador**: o dinheiro de fato saiu do
comprometido, e o disponível nunca é superestimado. O que se perde é a visibilidade de
*quanto* do utilizado ainda está com o ente, devido ao consignatário — que é justamente
o que a `8.2.1.1.3.02` mostraria.

`8.2.1.1.3.02` **fica fora do seed** enquanto ninguém lançar nela: uma conta no plano
que nenhum roteiro toca é um convite a lançar nela por engano.
