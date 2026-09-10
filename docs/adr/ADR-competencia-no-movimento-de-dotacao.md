# ADR — competência temporal nos movimentos de dotação

- **Estado:** **aceito**
- **Data da decisão:** 2026-09-10
- **Decidida por:** Winner (proprietário do produto)
- **Contexto do lote:** levantada em ENT03 durante a caracterização, decidida
  antes do ENT03a
- **Alternativa escolhida:** **A** — `competencia` como coluna nova ao lado de
  `criadoEm`
- **Consequência de calendário:** primeiro item do ENT03a, **antes** de cotas,
  contingenciamento e prévia de alteração. É a ordem inversa da que o prompt do
  ENT03 sugeria, e a inversão é consequência da medição.

## Problema

`MovimentoDotacao` guarda apenas `criadoEm` — o instante da gravação. Não existe
data de competência. `saldosDaFicha` não recebe corte temporal.

Consequência: um decreto com efeito em 20/06, lançado no sistema em 15/07,
responde errado à pergunta "qual era o saldo em 30/06?". Sem erro, sem aviso.

A assimetria agrava: `Empenho` tem `data`. Quem lê o modelo assume que a mesma
semântica vale para os movimentos de dotação, e não vale.

### O defeito não é hipotético — ele está no banco de desenvolvimento agora

Medido em 2026-09-10, no banco `gestao_publica` da porta 5436:

```
SELECT m.tipo, e.data, m."criadoEm"
  FROM "MovimentoDotacao" m LEFT JOIN "Empenho" e ON e.id = m."origemId";
```

| tipo | `Empenho.data` (o fato) | `criadoEm` (o registro) |
|---|---|---|
| EMPENHO × 12 | 2026-04-10 | 2026-09-09 / 2026-09-10 |
| DOTACAO_INICIAL × 2 | — | 2026-09-09 / 2026-09-10 |

**Cinco meses de distância.** Uma consulta de saldo em 30/06 cortada por
`criadoEm` hoje responderia que nenhum desses doze empenhos existia — e todos os
doze são fatos de abril. A resposta seria plausível, silenciosa e errada.

### E a competência já é conhecida — ela é calculada e depois descartada

Esta é a descoberta que muda o tamanho da decisão. `MovimentoDotacaoParams`, em
`modules/m05-despesa/dotacao-razao.ts`, **já tem o campo**, com este comentário
escrito antes deste ADR:

```ts
/**
 * A data do FATO. É ela que corta a MSC e o balancete — nunca o `criadoEm`.
 */
readonly data?: Date | undefined;
```

Os chamadores já a informam, e informam bem:

| Chamador | O que passa como `data` |
|---|---|
| M02 `adapter-prisma.ts:182` (LOA) | 1º de janeiro do exercício da ficha, não o dia da digitação |
| M03 `adapter-prisma.ts:518` (crédito adicional) | a data do **decreto** |
| M03 `adapter-prisma.ts:606` (anulação) | a data do ato de anulação |
| M05 `adapter-prisma.ts:811` (reserva liberada por empenho) | a data do **empenho** |
| M05 `adapter-prisma.ts:681` (reserva) | **nada** — declarado no código: `ReservaDotacao` não tem data própria |
| M05 `adapter-prisma.ts:1400` (liberação avulsa) | **nada** — idem |

E `registrarMovimentoDotacao` usa essa data **apenas** para o
`dataTransacao` da perna no razão. O `movimentoDotacao.create` logo acima não a
grava.

O fato tem uma data, o sistema a conhece, ela chega ao razão — e é jogada fora na
tabela de movimento. **Não estamos introduzindo um conceito novo: estamos
persistindo o conceito que já existe e já é computado.** Isso reduz o risco da
alternativa A e enfraquece o principal argumento da B.

## Por que isso não é uma funcionalidade ausente

É defeito de correção, não lacuna de escopo. Toda consulta de saldo por data
hoje devolve resposta plausível e errada. O que ainda não existe é o consumidor
que expõe o erro — e os consumidores que vêm a seguir são exatamente esses:
cotas por período, contingenciamento, prévia de alteração e a posição do
orçamento até a data selecionada exigida no planejamento.

Construir qualquer um deles antes de resolver isto significa herdar a semântica
errada em cada um.

## As duas perguntas são diferentes

O sistema precisa responder duas coisas que hoje se confundem numa coluna só:

| Pergunta | Dimensão | Uso |
|---|---|---|
| Qual era a dotação disponível em 30/06? | competência — data do efeito legal do ato | posição do orçamento, cotas, contingenciamento, demonstrativos de período |
| O que o sistema respondia em 30/06? | registro — instante da gravação | auditoria, reprodução de demonstrativo já publicado, investigação de divergência |

São dois eixos independentes. Um ato de junho registrado em julho tem
competência menor que o registro; um ato de julho registrado em julho tem as
duas iguais. Nenhuma das duas deriva da outra.

## Alternativas

### A. Acrescentar `competencia` ao lado de `criadoEm` — **escolhida**

- A favor: responde as duas perguntas; alinha `MovimentoDotacao` a `Empenho`,
  eliminando a assimetria que induz erro; migration aditiva, sem `DROP`; e —
  medido acima — o valor a gravar **já é conhecido em cinco dos seis chamadores**.
- Contra: muda o significado de toda consulta de saldo — é exatamente o que os
  testes de caracterização existem para detectar. Exige backfill dos movimentos
  já gravados.

### B. Derivar o corte de outra fonte

Reconstruir a competência a partir do ato de origem no momento da consulta —
data do empenho, data do decreto, data da lei.

- A favor: nenhuma coluna nova, nenhum backfill.
- Contra: a origem nem sempre existe como registro consultável — as duas
  reservas medidas acima são precisamente esse caso; a derivação vira junção em
  cada consulta de saldo, no caminho mais quente do sistema; e a regra fica
  implícita em código em vez de explícita no dado. Movimento sem ato de origem
  identificável não tem resposta.

### C. Adiar

- Contra: cada dia de operação aumenta o custo do backfill, e a tabela é de
  movimento — cresce rápido. Todo consumidor construído no intervalo herda a
  semântica errada e precisa ser revisto depois.

## Decisão

**Alternativa A**, com estas condições — todas obrigatórias:

1. `competencia` entra como coluna nova, **nullable**, em migration aditiva.
   `criadoEm` **permanece** e nunca é substituído — perder o eixo de registro
   impediria reproduzir demonstrativo já publicado.
2. Backfill a partir do ato de origem quando existir. Sem origem identificável,
   usa `criadoEm` e **marca a linha como derivada por ausência**
   (`competenciaDerivada`), para que a incerteza fique **no dado** e não na
   memória de quem migrou.
3. Depois do backfill, `competencia` passa a **`NOT NULL`**.
4. `MovimentoDotacao` **está** sob a imutabilidade concedida ao papel da
   aplicação. Medido em 2026-09-10:

   ```
   gestao_app | INSERT
   gestao_app | SELECT
   ```

   Nenhum `UPDATE`, nenhum `DELETE`, e a tabela **não** consta de
   `ESCRITA_MUTAVEL_DO_RUNTIME` em `prisma/papel-runtime.ts`. O backfill roda
   **uma vez, dentro da migration, pelo papel `gestao`** — que é o papel de
   migração, não o da aplicação. **O grant de `gestao_app` não é afrouxado**, nem
   durante nem depois. Depois do backfill a tabela volta a ser, para o runtime,
   estritamente append-only.
5. `saldosDaFicha` recebe o corte de competência. A assinatura de dois
   parâmetros **não continua existindo com o significado antigo em silêncio**: ou
   ganha nome que declare o que faz, ou obriga o chamador a escolher o eixo.
   Os testes de caracterização vão acusar cada consumidor — é para isso que
   foram escritos. **Cada acusação é decisão consciente registrada, não ajuste
   no teste.**
6. Movimento com competência em período fechado é **rejeitado no caso de uso**,
   como qualquer escrita financeira.

## Ordem de precedência do backfill

Da fonte mais forte para a mais fraca. A primeira que responder ganha.

| Ordem | Fonte | Alcança | `competenciaDerivada` |
|---:|---|---|---|
| 1 | `LancamentoContabil.dataTransacao` da perna no razão (`origemId = movimento.id`) | DOTACAO_INICIAL, CREDITO_ADICIONAL, ANULACAO_CREDITO, RESERVA, RESERVA_LIBERADA | `false` |
| 2 | `Empenho.data` via `origemId` | EMPENHO, EMPENHO_ANULADO | `false` |
| 3 | `criadoEm` | o que sobrar | **`true`** |

A ordem 1 não é uma heurística: aquela `dataTransacao` **é** o `p.data` que o
chamador passou, já gravado. Estamos recuperando o valor da própria função que o
descartou, não adivinhando-o.

## O que este ADR NÃO decide

- **Não** dá data própria a `ReservaDotacao`. As reservas continuarão com
  competência derivada de `criadoEm`, marcadas como tal. Dar-lhes data é decisão
  de domínio separada, e a marca no dado é o que permite encontrá-las quando a
  hora chegar.
- **Não** toca o eixo de competência do razão (`LancamentoContabil.dataTransacao`),
  que já existe e já funciona.
- **Não** reabre o travamento de competência do M16.
