# M06 — ordem cronológica de pagamentos

**Lei 14.133/2021, art. 141.** Status: **concluído** (blocos 1, 2 e 3).

## Base legal

- **Caput** — a ordem cronológica é **por fonte de recursos**, subdividida em 4
  **categorias de contrato**: `FORNECIMENTO_BENS`, `LOCACAO`,
  `PRESTACAO_SERVICOS`, `REALIZACAO_OBRAS`. O **marco de exigibilidade** é a
  **liquidação** da despesa.
- **§1º** — quebra da ordem SOMENTE com justificativa prévia, nas hipóteses
  **taxativas** (`HipoteseQuebraOrdem`). Não existe "outros".
- **§2º** — preterição imotivada = apuração de responsabilidade. **Por isso o
  fail-closed**: o sistema não deixa pagar fora de ordem sem deixar rastro.
- **§3º** — divulgação mensal da ordem + justificativas.
  `consultaOrdemCronologica()` entrega o dataset; a UI é do M13.

## Depende de

- **M05** — lê `Liquidacao`, `Pagamento`, `Empenho` pelo Prisma.
- **M02** — a fonte vem da `FichaOrcamentaria` do empenho.

**Direção da dependência: M05 → M06, nunca o inverso.** O M06 **não importa** o
M05; é o `pagar()` do M05 que chama `validarOrdemCronologica`.

## Invariantes

1. **A FILA É DERIVADA, NÃO TABELA.** `filaDePagamentos(fonte, categoria)` é uma
   CONSULTA: liquidações com saldo a pagar > 0 (valor liquidado − **SUM real**
   dos pagamentos), ordenadas pela data de liquidação. Não existe coluna
   `posicaoNaFila` nem tabela `Fila` — elas mudariam a cada pagamento e seriam
   mais um cache para derrapar.
2. **APPEND-ONLY.** `JustificativaQuebraOrdem` não tem `updatedAt` nem
   `deletedAt`. Uma justificativa editável depois do fato não serve de prova
   quando o §2º mandar apurar.
3. **ATOMICIDADE.** A justificativa é gravada na **mesma transação** do
   pagamento. Se o pagamento falha, a justificativa não existe; se a
   justificativa falha, o pagamento não acontece. Não há meio-termo.
4. **FAIL-CLOSED (§2º).** Pagar quem não é a cabeça da fila **sem** justificativa
   = erro, e **nada** é gravado: nem pagamento, nem lançamento, nem partida
   (verificado por `SELECT` no teste).

## Decisões conscientes

- **`Empenho.categoriaOrdemCronologica` é obrigatória e SEM `@default` no
  schema.** Um default faria todo empenho novo virar `FORNECIMENTO_BENS` em
  silêncio, e **a fila de obras se misturaria com a de bens** sem ninguém
  perceber. O default histórico vive no **script de migração** (explícito, uma
  vez), não no schema (onde seria um bug permanente). A liquidação **herda** a
  categoria do empenho.
- **A fila desempata pelo NÚMERO da liquidação.** Duas liquidações no mesmo dia
  precisam de uma ordem **total** — sem desempate, "a cabeça da fila" seria
  ambígua e a regra viraria loteria.
- **PAGAMENTO PARCIAL NÃO TIRA DA FILA.** A liquidação parcialmente paga continua
  ali, na posição da **data original**, até ser quitada. Se saísse, bastaria pagar
  **R$ 0,01** a cada credor para desmontar a ordem inteira. Testado.
- **A mensagem de erro nomeia quem está sendo preterido** — posição na fila, quem
  é a cabeça e desde quando. Sem isso, o §2º não teria o que apurar:

  ```
  Art. 141 — QUEBRA DA ORDEM CRONOLÓGICA sem justificativa. A liquidação NL2
  está na posição 2 da fila (fonte 500, categoria FORNECIMENTO_BENS); a cabeça
  é a liquidação NL1, liquidada em 2026-01-05. O §1º só admite pagar fora de
  ordem mediante justificativa prévia numa das hipóteses taxativas.
  ```
- **Justificativa exige ≥ 30 caracteres.** Um texto de três palavras não é
  justificativa e não serve de prova.
- **A fila é lida DENTRO da transação** do pagamento — duas requisições
  concorrentes não podem ambas achar que são a cabeça.

## Arquivos

- `prisma/schema/m06-ordem-cronologica.prisma` — `JustificativaQuebraOrdem`;
  enums `CategoriaOrdemCronologica` e `HipoteseQuebraOrdem`.
- `prisma/migrations/…_m06_ordem_cronologica/migration.sql` — **escrita à mão**,
  com backfill em 3 passos (ver abaixo).
- `modules/m06-ordem-cronologica/dominio.ts` — `ordenarFila`, `avaliarOrdem`,
  Zod. **Puro, sem I/O.**
- `modules/m06-ordem-cronologica/ports.ts`, `adapter-prisma.ts`, `index.ts`.
- `modules/m06-ordem-cronologica/m06.test.ts` (domínio + fila derivada) e
  `m06-pagamento.test.ts` (integração com o `pagar()` do M05).

## A migration precisou ser escrita à mão

O SQL que o `prisma migrate diff` gera para o campo novo é:

```sql
ALTER TABLE "Empenho" ADD COLUMN "categoriaOrdemCronologica" ... NOT NULL;
```

e isso **falha em qualquer banco que já tenha empenho** — o Postgres não sabe o
que pôr nas linhas existentes. Provado:

```
ERROR: column "cat" of relation "demo" contains null values
```

Passaria no dev (0 empenhos) e **explodiria em produção**. A migration faz em 3
passos: `ADD COLUMN` nullable → `UPDATE ... WHERE NULL` → `SET NOT NULL`.

## Pendências

- **`consultaOrdemCronologica` não tem UI nem endpoint** — é só a query. O
  consumidor é o M13 (transparência), que ainda não existe.
- **A categoria do empenho não é validada contra o objeto do contrato.** Nada
  impede classificar uma obra como `FORNECIMENTO_BENS`. Quando o M11
  (licitações/contratos) existir, a categoria deveria vir do contrato, não da
  digitação.
