# M01 — core-contabil

Núcleo contábil do SIAFIC: plano de contas PCASP + ledger de partidas dobradas
em PERNA ÚNICA, append-only. É a fundação sobre a qual M02–M18 escrevem — nenhum
outro módulo grava no ledger direto, todos chamam `registrarLancamento` /
`estornarLancamento`.

## Requisitos TR cobertos

- TR pág. 2, itens **2.1–3.4** — registro contábil único e integrado; o
  `numeroControle` agrupa o fato contábil (item 2.5).
- TR **5.90–5.95** — escrituração por partidas dobradas, plano de contas PCASP
  (hierarquia, natureza do saldo, indicador de superávit F/P) e segregação por
  subsistema (orçamentário / patrimonial / controle).

## Depende de

- `packages/ledger` — motor puro de partidas dobradas (`validarLancamento`,
  `gerarEstorno`). Zero I/O, zero Prisma.
- `packages/contracts` — `Money`/`Decimal`, `toMoney`, `assertBalanced`, `zMoney`.
- `prisma/schema/_base.prisma` — datasource/generator.

Nada mais. O M01 **não** importa nenhum outro módulo.

## Invariantes (NUNCA violar)

1. **DINHEIRO = Decimal.** `Decimal @db.Decimal(18,2)` no schema; `Decimal`
   (decimal.js) no domínio. Zero Float/Number em valor — `zMoney` rejeita
   `number` na entrada. Na fronteira do Prisma o valor cruza como **string de 2
   casas**: `Prisma.Decimal` e o `Decimal` do domínio são classes distintas, e
   passar uma pela outra é como o dinheiro se corrompe em silêncio.
2. **APPEND-ONLY.** `LancamentoContabil` e `PartidaContabil` nunca sofrem
   UPDATE/DELETE. Sem `updatedAt`, sem `deletedAt`. A `LancamentoRepositoryPort`
   só expõe `persistir` e `buscar` — de propósito.
3. **ESTORNO não escreve de volta no original.** Estorno = lançamento NOVO com
   partidas invertidas, referenciando o original via `estornoDeId` (imutável,
   setado na criação). **Não existe `estornadoPorId`** — marcá-lo exigiria um
   UPDATE no original. "Está estornado?" é DERIVADO da relação inversa:
   `estornos.length > 0`. Um lançamento é estornado no máximo UMA vez.
4. **PERNA ÚNICA.** Cada `PartidaContabil` é DEBITO **ou** CREDITO, nunca os
   dois. Lançamento só é válido se `ΣDEBITO == ΣCREDITO` (`assertBalanced`),
   houver ≥1 débito e ≥1 crédito, e todo valor > 0.
   **Reforço além do spec:** isso vale também DENTRO de cada subsistema presente
   no lançamento. Como `subsistema` está na partida (não no lançamento), sem
   esse reforço um orçamentário desbalanceado (800 D / 700 C) seria
   "compensado" por um patrimonial (200 D / 300 C) e o total fecharia mentindo.
5. **FAIL-CLOSED.** Partida em conta SINTÉTICA (`analitica = false`) = REJEITAR.
   Conta inexistente no PCASP = REJEITAR (nunca criar implicitamente). Nada que
   não passe em `validarLancamento` é persistido. Barreira dupla: no serviço
   (contra a `ContaRepositoryPort`) e de novo **dentro da transação** do adapter
   — entre a checagem e o INSERT o plano de contas pode mudar.

## Máquinas de estado

**Nenhuma.** O M01 não tem entidade com status mutável — o lançamento é registro
imutável. O que existe é a relação de estorno:

```
original.estornos == []      => estornável
original.estornos != []      => JÁ ESTORNADO, rejeita novo estorno
estorno.estornoDeId != null  => é um estorno
```

`ContaPcasp.analitica` é fixo por conta: uma sintética nunca "vira" analítica —
se virasse, os saldos históricos ficariam inconsistentes.

## A competência do lançamento — REMOVIDA, e a história importa

O `LancamentoContabil` tem **UMA** data de negócio: `dataTransacao`, a data do **fato**. Houve
uma segunda — `competencia` — e ela foi removida. O caminho até aqui é o registro de como este
repositório trata uma afirmação não verificada, e por isso fica escrito.

| commit | o que se afirmou / o que se descobriu |
|---|---|
| `a4f2bd6` | Afirmei que a coluna era **"escrita e nunca lida"**, e agendei a remoção como decisão fechada. |
| `498de7b` | **A afirmação era falsa, e o grep do passo 0 a desmentiu antes de qualquer migração.** A coluna *era* lida: `packages/ledger/estorno.ts` fazia `competencia: params.competenciaEstorno ?? original.competencia` — **todo estorno herdava a do original**, em ~20 pontos (M01, M04, M05, M07, M08, M10). Pior: rodado contra o banco de verdade, ela **divergia** da `dataTransacao` (`2026NL000099: dataTransacao=2026-07-05, competencia=2026-07-01`). A remoção foi **CANCELADA**, e o problema, renomeado: não era uma coluna morta — era uma **segunda competência dormente**. |
| *este commit* | Removida, **agora com a verificação feita**. |

### O que o grep desta vez provou (e é ele que autorizou o `DROP`)

- **ZERO leitores.** Nenhum `where`, `orderBy`, `groupBy` ou filtro por
  `LancamentoContabil.competencia` — em produção **e** em teste.
- Os ~20 `select: { competencia: true }` a liam **apenas para reescrevê-la no estorno**: o laço
  fechado, sem consumidor.
- Todo corte deste repositório é por **`dataTransacao`** (o travamento do M16 — ver
  `m16-travamento/guard.ts`) ou por **`criadoEm`** (o encerramento do M08). MSC, MANAD, DVP,
  balanços e os datasets do M13 **não a emitem**.
- O parâmetro `competenciaEstorno` — que prometia "fazer o estorno cair na competência aberta" —
  **nunca foi passado por ninguém** em produção. Morreu junto.

### Por que remover, e não deixar quieta

Uma coluna que **só se escreve** e que **diverge** é uma mina armada para o primeiro leitor
ingênuo. O dia em que alguém escrevesse `where: { competencia: ... }` acreditando nela, o estorno
de janeiro apareceria em dezembro — e o relatório **fecharia**, plausível e errado. É pior do que
não ter competência nenhuma: é ter uma que **mente com cara de verdade**.

### ⚠️ Isto NÃO é a desistência do regime de competência — é a rota 5.87/5.88

O regime de competência (NBC TSP: a despesa pertence ao mês do **fato gerador**, não ao do
pagamento) **é real e vai ser implementado**. O que foi removido é um campo que **não o
implementava**.

Quando o **5.87/5.88** chegar, a competência nasce **na entidade dona do fato** (a liquidação tem
a sua; o `MovimentoPatrimonial.competencia` do M10 **já tem** a dele — e é legítima, tem leitor, e
ficou intacta), **com leitor nomeado no mesmo commit**. **Coluna sem leitor não entra** — foi
exatamente assim que esta nasceu.

A rede que impede a volta: `m01-funil.test.ts` **t2**, um grep pelo **uso da coluna** (o
`competencia:` ao lado de `dataTransacao:` — a assinatura do payload do lançamento), e não pela
palavra: as competências do M10 (depreciação, provisão, dívida) são campos próprios de movimento,
têm leitor, e o grep não as toca.

## Decisões conscientes (não são esquecimentos)

- **Guard `contaDebito != contaCredito` REMOVIDO na transição para perna única.**
  Na Parte 0 (linha pareada) ele fazia sentido: uma linha que debita e credita a
  mesma conta é um no-op. Em perna única não há tradução direta, e o equivalente
  ("mesma conta como DEBITO e CREDITO no mesmo lançamento") passa a ser
  **legítimo** assim que o M02/M05 trouxerem as dimensões: a mesma conta com
  fontes de recurso diferentes é um lançamento real. O guard deve reaparecer
  como `conta + dimensões != conta + dimensões` quando `fonte`/`CO` entrarem na
  `PartidaContabil` — não como `conta != conta`.
- **`validarLancamento` NÃO agrupa por `numeroControle`.** No modelo resolvido o
  `numeroControle` vive no `LancamentoContabil`, não na `PartidaContabil` — as
  partidas chegam agrupadas por construção (são as pernas daquele lançamento).
  Não há o que agrupar. Descer `numeroControle` para a partida seria
  denormalizar e criar uma nova fonte de inconsistência (partida com
  `numeroControle` divergente do lançamento pai).

## Arquivos deste módulo

- `prisma/schema/m01-core-contabil.prisma` — enums `NaturezaSaldo`,
  `IndicadorSuperavit`, `TipoPartida`, `Subsistema`; models `ContaPcasp`,
  `LancamentoContabil`, `PartidaContabil`.
- `prisma/sql/uq_estorno_unico.sql` — índice único parcial aplicado pós-migrate
  (um estorno por `estornoDeId`); não cabe em `@unique` do Prisma.
  **Não pode morar em `prisma/migrations/`**: toda subpasta de lá é lida como
  migration e o Prisma exige um `migration.sql` dentro (erro `P3015`).
- `modules/m01-core-contabil/dominio.ts` — Zod de entrada + `comporLancamento`
  (compõe as partidas e chama `validarLancamento`; **sem I/O**).
- `modules/m01-core-contabil/ports.ts` — `ContaRepositoryPort`,
  `LancamentoRepositoryPort`, `IdPort`, `M01Deps`. Nenhuma referência a Prisma.
- `modules/m01-core-contabil/servico.ts` — casos de uso `registrarLancamento`,
  `estornarLancamento`.
- `modules/m01-core-contabil/adapter-prisma.ts` — única camada que conhece
  Prisma. `criarM01Deps(prisma)`.
- `modules/m01-core-contabil/index.ts` — superfície pública.
- `modules/m01-core-contabil/m01.test.ts` — testes com fakes das ports e seed
  mínimo do PCASP (rodam sem banco).
- `modules/m01-core-contabil/m01.integracao.test.ts` — testes contra Postgres
  real. Pulados automaticamente (`describe.skipIf`) se não houver banco
  acessível, para não quebrar quem só roda os testes puros.

## Fora de escopo aqui

- **Ficha orçamentária de 12 níveis** → M02 (orcamento). As dimensões do
  lançamento (fonte de recurso, categoria econômica, ficha, centro de custo)
  entram como colunas **aditivas** em `PartidaContabil` — não alterar as
  colunas existentes.
- **Retenções** → M15 (esocial) e correlatos.
- **Eventos contábeis automáticos** → Matriz de eventos (módulo próprio). O M01
  recebe as partidas prontas; não decide quais contas debitar/creditar por tipo
  de fato.
- **Seed do PCASP completo** → tarefa de dados separada. Aqui só o seed mínimo
  dos testes.
- **Geração do `numeroControle`** → módulo de origem (M03 receita, M04 despesa…).
  O M01 recebe pronto.
- **Balancetes e demonstrativos** (Balanço Patrimonial, DVP) → M16/M17 leem as
  partidas.

## Armadilhas do Prisma 7 (aprendidas na marra, não repetir)

- **O client EXIGE um driver adapter.** No Prisma 7 o query compiler está ligado
  (não há mais engine Rust): `datasourceUrl` e `datasources` **não existem** no
  construtor do `PrismaClient` — passá-los dá
  `PrismaClientConstructorValidationError`. Use `criarPrismaClient(url)` do
  `adapter-prisma.ts`, que monta o client com `@prisma/adapter-pg`.
- **`prisma/migrations/` só aceita migrations.** Qualquer subpasta ali é lida
  como migration e precisa de um `migration.sql`. Um `.sql` avulso numa subpasta
  quebra o `migrate` com `P3015`. Por isso o SQL manual vive em `prisma/sql/`.
- **Índice parcial NÃO gera drift.** Verificado: com `uq_estorno_unico` aplicado
  no banco, `prisma migrate dev --create-only` gera uma migration **vazia** — o
  Prisma não representa índices parciais e simplesmente os ignora no diff, em
  vez de tentar dropá-los. Ou seja, a garantia dura no banco convive em paz com
  o schema. **Não** "corrigir" isso com `@unique`.

## Como rodar com banco

```bash
docker run --name pg-siafic -e POSTGRES_USER=siafic -e POSTGRES_PASSWORD=siafic \
  -e POSTGRES_DB=siafic_cg -p 5432:5432 -d postgres:18
npx prisma migrate dev
docker exec -i pg-siafic psql -U siafic -d siafic_cg < prisma/sql/uq_estorno_unico.sql
npx vitest run
```

O índice parcial é passo separado e **obrigatório** em qualquer ambiente novo —
sem ele, a unicidade do estorno depende só do recheck na transação do adapter,
que sob isolamento READ COMMITTED pode não ver um estorno concorrente.

---

# 7.2 — O plano de contas ganha dono (roteiros, seed, guard)

Até aqui, o **roteiro contábil** — quais contas cada fato debita e credita — era
responsabilidade do *chamador*, e nenhum código de produção montava um. `ContaPcasp`
nascia em **55 arquivos, todos `*.test.ts`**. O banco da aplicação tinha três contas
avulsas. Como `resolverContas` é fail-closed, toda escrita da execução morria em
"Conta(s) inexistente(s) no plano PCASP" — o bloqueio que travou as telas da 7.1.

Esta fatia dá um dono a cada uma dessas coisas.

## `roteiros.ts` — a política da execução

`modules/m01-core-contabil/roteiros.ts` exporta `roteiroEmpenho`, `roteiroLiquidacao`,
`roteiroPagamento` e `roteiroArrecadacao`, com as contas do extrato oficial STN/MCASP.
`test/roteiro-orcamentario.ts` virou **re-export** — um dono, e a fixture segue o
domínio em vez do contrário.

O encadeamento orçamentário, que é o que faz a cadeia fechar:

```
empenho     D 6.2.2.1.1     / C 6.2.2.1.3.01
liquidação  D 6.2.2.1.3.01  / C 6.2.2.1.3.03
pagamento   D 6.2.2.1.3.03  / C 6.2.2.1.3.04
```

O crédito de cada estágio é o débito do seguinte.

### `ROTEIRO-HARDCODED-VS-TABELA` (decisão)

Este repositório trata roteiro como **dado**: há 9 tabelas (`RoteiroOrcamentario`,
`RoteiroPatrimonial`, `RoteiroAlmoxarifado`, …), cada uma com FK para `ContaPcasp`. O
natural seria uma 10ª. Mas tabela exige **schema e migração**, e a 7.2 é aditiva. A
política da execução nasce em **código**, e migra para tabela quando o PCASP completo
chegar. Registrado para não parecer descuido.

### `SEM-ESTAGIO-EM-LIQUIDACAO` (decisão)

O MCASP dá `6.2.2.1.3.02` ("em liquidação") como de uso **facultativo**. Este sistema
não o usa: a liquidação vai direto de "a liquidar" para "liquidado a pagar". A conta
existe no **plano** (é oficial) e em **roteiro nenhum** — a constante fica exportada
para que a decisão esteja onde alguém vai procurá-la.

### `MAPA-ELEMENTO-CONTA` (pendência)

A perna devedora da liquidação depende do **elemento** da natureza da despesa —
"a despesa incorrida virou o quê?":

| Elemento | Vira | Conta |
|---|---|---|
| 39 — serviços PJ | VPD (a riqueza diminuiu) | `3.3.2.1.1.01.00` |
| 30 — material de consumo | estoque (mudou de forma) | `1.1.5.1.1.00.00` |
| 71 — principal da dívida | baixa de passivo | `2.2.1.1.1.00.00` |

**Rol fechado e fail-closed.** São os três elementos que as fixtures **provam**; o
Anexo II da Portaria 163/2001 tem 78. Um `default: VPD` faria o empenho de um
computador (elemento 52) virar despesa em vez de imobilizado — o patrimônio nunca
cresceria, e **o lançamento fecharia**, então ninguém veria. Melhor derrubar nomeando
o elemento. O xlsx PCASP Estendido fecha o rol.

Pendência irmã `MAPA-NATUREZA-CONTA`: a VPA da arrecadação também varia (impostos,
transferências…) e, na operação composta M04×M10, nem VPA é — `arrecadarComVinculo`
passa o crédito a receber, porque a VPA já nasceu no reconhecimento. Por isso essa
perna vem do **ato**, não de um rol.

### `DDR-CLASSE-8` (pendência)

O espelho oficial tem as pernas de controle de disponibilidade
(pagamento: `D 8.2.1.1.3.01 / C 8.2.1.1.4.01`). Este sistema **não as emite**: incluí-las
mudaria a contagem de partidas de M05, M07 e M08 de uma vez (empenho 2→4, liquidação
4→6, pagamento com retenção 6→8). As contas entram no **plano** (são oficiais); as
pernas ficam para sessão própria, **antes do RGF Anexo 5** — que é quem lê a DDR.

## `prisma/seed/pcasp.ts` — o plano mínimo, com procedência

`ContaPcasp` **não tem coluna `origem`**, e schema é intocável. Então a procedência é
**estrutural**: duas listas exportadas.

- `CONTAS_PCASP_STN` — extrato oficial. São verdade.
- `CONTAS_FIXTURE_A_CONFIRMAR` — códigos herdados das fixtures. Melhor informação
  disponível; podem estar errados.

Idempotente (`upsert` por código). **Não roda em teste**: `limpar-banco.ts` trunca
`ContaPcasp`, e as fixtures são donas do banco de teste.

**Divergência conhecida — duas disponibilidades:** o M04 arrecada em `1.1.1.1.1.00.00`
(Caixa) e o M05 paga por `1.1.1.1.2.00.00` (Bancos). As duas entram, porque as duas
fixtures rodam; mas o ente tem um caixa e um banco, e uma das duas está no lugar
errado. Chutar aqui faria o Balanço Financeiro somar dois saldos que são o mesmo
dinheiro.

Pendência `PCASP-COMPLETO`: o xlsx PCASP Estendido 2026 da STN confirma ou corrige a
segunda lista e faz a primeira crescer.

## `prisma/seed/bootstrap-usuario.ts` — a primeira chave

Desde a 6.3 a UI inteira vive atrás de `exigirSessao()`, e criar usuário pela tela
ficou nomeado. Um banco novo tinha **zero usuários**: o sistema atrás de uma porta cuja
chave não existia. `SEED_ADMIN_SENHA` obrigatória, mínimo lido do domínio
(`COMPRIMENTO_MINIMO_DA_SENHA`, 12) para que os dois não divirjam. **Fail-hard**, sem
default no código — um default nasceria igual em toda instalação e ficaria versionado
para sempre. Idempotente, e **não reescreve a senha de um admin existente**: um seed
que a resetasse seria porta dos fundos.

## `GUARD-NATUREZA-INFORMACAO` — quitado (e o que ele achou)

`validarLancamento` (`packages/ledger/motor.ts`) ganhou o invariante **(f)**: o
`subsistema` da perna é validado contra o **1º dígito** da conta — patrimonial (1-4),
orçamentária (5-6), controle (7-8). Record exaustivo, fail-closed.

Antes, `subsistema` era um **rótulo livre**: nada o amarrava à conta. O invariante (e)
só conferia que cada subsistema fechava sozinho — e um rótulo torto fecha tão bem
quanto um certo. O estrago era silencioso e tardio: o razão do subsistema errado
contaminado, e a divergência aparecendo no fechamento, quando ninguém lembra de qual
lançamento veio.

**O diagnóstico, como registro histórico: 85 falhas → 12 arquivos → 3 padrões.**

| Padrão | Ocorrências | O que era |
|---|---|---|
| `6.2.2.1.1.00.00` como `disponibilidade` | 42 | o pagamento saía do **"Crédito Disponível"** em vez do banco |
| `6.2.1.1.0.00.00` como crédito patrimonial | 20 | "IPTU a receber" com código de **classe 6** |
| `6.2.2.1.3.03.00` como `variacaoAumentativa` | 10 | o ganho do cancelamento de RP creditava **"Crédito Liquidado"** |

A causa raiz era sempre a mesma: **faltava a conta na fixture**, e o autor pegou a que
estava à mão. O `m08-anulacao-rp.test.ts` se entregava no comentário —
`const CAIXA_RP = "6.2.2.1.1.00.00"; // a "disponibilidade"`.

As correções (fixture corrigida, guard nunca afrouxado):

- os 8 sítios de `disponibilidade` → `1.1.1.1.2.00.00` (Bancos);
- os 3 de `variacaoAumentativa` → `4.6.4.1.1.00.00` (**PCASP 4.6.4**: "ganhos com
  desincorporação de passivos, *inclusive as baixas de passivo decorrentes do
  cancelamento de restos a pagar*");
- os literais patrimoniais de `6.2.1.1` → `1.1.2.2.1.00.00` (Créditos Tributários a
  Receber). A `6.2.1.1` **continua existindo** como Receita a Realizar, orçamentária —
  o errado era o uso, não a conta.

**Dois achados que o guard mascarava** (ele lança na primeira perna torta, então os 85
eram piso, não teto):

- `6.2.1.2.0.00.00` também aparecia em posição patrimonial (4 sítios), atrás dos
  `6.2.1.1` que estouravam primeiro;
- `m01.test.ts` tinha o **inverso** do padrão: `1.1.1.1.2.00.00` (Bancos, classe 1)
  rotulada `ORCAMENTARIO`;
- o teste da conta inexistente usava `9.9.9.9.9.99.99` — classe 9, que o guard rejeita
  antes do adapter. Virou `1.9.9.9.9.99.99`: classe **válida**, conta inexistente, para
  que ele volte a provar o que se propôs (o adapter recusa conta fora do plano) em vez
  de ficar verde provando outra coisa.

Nenhuma expectativa **aritmética** mudou: mesmos valores, contas certas.

### O alcance real da correção de código

A troca `6.2.2.1.3.00.00 → .01` não foi de um arquivo: **44 arquivos de teste** usavam
o literal da SINTÉTICA como se fosse analítica (~80 ocorrências). Cada um **semeava** e
**usava** o mesmo código, então os dois se moviam juntos — mas o dia em que
`test/roteiro-orcamentario.ts` virou re-export (passando a semear `.01`), os cinco que
dependiam dele e usavam `.00` literal quebraram de uma vez. Foi assim que o alcance
apareceu.

### Os QUATRO padrões que o guard revelou

Os 85 do diagnóstico eram **piso, não teto**: o guard lança na primeira perna torta e
**mascara as seguintes**. Ao destravar cada um, apareceram os demais:

1. classe 6 (`6.2.2.1.1`) como `disponibilidade` — o pagamento saía do "Crédito
   Disponível" em vez do banco;
2. classe 6 (`6.2.1.1`) como crédito patrimonial — "IPTU a receber" com código
   orçamentário; e `6.2.1.2` idem, em 4 sítios que só apareceram depois;
3. classe 6 (`6.2.2.1.3.03`) como `variacaoAumentativa` — o ganho do cancelamento de RP
   creditava "Crédito Liquidado";
4. **o inverso**: `1.1.1.1.2.00.00` (Bancos, classe 1) rotulada `ORCAMENTARIO`. E o
   teste da conta inexistente usava `9.9.9.9.9.99.99` — classe 9, que o guard rejeita
   antes do adapter; virou `1.9.9.9.9.99.99` (classe válida, conta inexistente) para
   voltar a provar o que se propunha.

## Higiene de ambiente — `prisma migrate deploy` depois do pull

O banco de **teste** é recriado do schema a cada execução da suíte; o de **dev**, não.
Na 7.2 o enum `AcaoDoSistema` tinha **84** valores em dev e **173** no código — um seed
que usasse uma ação nova derrubava com `invalid input value for enum`.

Não é furo do sistema: é ambiente atrasado. **Depois de todo pull que traga migração:**

```bash
npx prisma migrate deploy
```

---

# 7.4 — A DDR (controle da disponibilidade de recursos)

`DDR-CLASSE-8` quitada. Os quatro roteiros da execução ganharam pernas de controle, e
nasceu `saldoDdrPorFonte` — o insumo do RGF Anexo 5.

## A pergunta que a DDR responde, e que a classe 6 não

O controle orçamentário (classe 6) diz **quanto do CRÉDITO sobrou**. A DDR diz **quanto
DINHEIRO daquela fonte ainda está livre**. Divergem o tempo todo: há crédito sem
dinheiro (a receita não entrou) e dinheiro sem crédito (arrecadou-se além do previsto).
É a DDR que denuncia o empenho contra caixa que não existe.

## A cadeia (7 × 8)

```
arrecadação  D 7.2.1.1     / C 8.2.1.1.1      entrou, e está livre
empenho      D 8.2.1.1.1   / C 8.2.1.1.2.01   livre → comprometido por empenho
liquidação   D 8.2.1.1.2.01/ C 8.2.1.1.3.01   → comprometido por liquidação
pagamento    D 8.2.1.1.3.01/ C 8.2.1.1.4.01   → utilizado (saiu)
```

A classe 7 é o total sob controle; a 8 detalha o **estado**. Só a arrecadação toca a 7 —
é o único ato que traz dinheiro novo. Cada crédito é o débito do seguinte.

**A anulação não tem roteiro próprio:** `gerarEstorno` inverte todas as pernas, e a DDR
volta sozinha. Um roteiro de anulação seria a chance de ele divergir do fato que nega.

## ⚠️ O saldo livre É a `disponivel` — não se subtrai de novo

A fórmula `disponivel − comprometida − utilizada` **subtrai duas vezes**: o empenho já
debita a `8.2.1.1.1`, então `disponivel` já vem líquido do comprometido. Os quatro
baldes não se subtraem — eles **particionam** o que entrou:

```
                     dispon.  c/emp   c/liq   utiliz.  TOTAL
arrecada 10.000      10.000       0       0        0   10.000
empenha   8.000       2.000   8.000       0        0   10.000
liquida   6.000       2.000   2.000   6.000        0   10.000
paga      6.000       2.000   2.000       0    6.000   10.000
```

O `total` é **invariante** fora da receita — só a arrecadação o move — e espelha o saldo
da classe 7. É por isso que ele serve de prova: se mudar num ato que não é arrecadação,
alguma perna se perdeu.

## Onde a fonte estava, já que a perna não a tem

`PartidaContabil` tem `fichaId`, não `fonteId` — e a arrecadação não tem ficha (a
receita é do ENTE). A fonte se deriva do **fato**, pelas relações 1-1 do
`LancamentoContabil`: `empenho → ficha.fonteId`, `liquidacao → empenho.ficha.fonteId`,
`pagamento → fonteId` (o pagamento a carrega), `receita → fonteId`. Um join a mais em
troca de nenhuma coluna nova — e de nenhuma segunda verdade sobre a fonte de um fato
que já a tem.

O pagamento usa a fonte **dele** (a do banco, que a TR 5.23 amarra), não a da ficha: a
DDR é controle de CAIXA, e o que vale é de onde o dinheiro saiu.

## Achado: os dois donos do roteiro

A 7.2 disse "um dono" — e isso vale para a DOTAÇÃO (`test/roteiro-orcamentario.ts` virou
re-export). Mas `m05-despesa/dominio.ts` **continua exportando** `roteiroEmpenho`,
`roteiroLiquidacao` e `roteiroPagamento` próprios, e é deles que **todas as fixtures**
de M04/M05/M06/M07/M08/M12 se servem. Só a **porta** (7.3) e os testes de borda usam os
do M01.

Consequência medida nesta fatia: ao pôr a DDR nos roteiros do M01, as asserções de
partidas de `m04.test`, `m05.test`, `m05b.test` **não mudaram** — elas testam o roteiro
legado, sem DDR. Ou seja: **produção move a DDR; a maior parte das fixtures, não.**

Não é bug — é o limite que `m16-borda-execucao.test.ts` existe para cobrir (ele usa o
roteiro E o plano de produção). Mas é dívida: pendência **ROTEIRO-LEGADO-M05**, para
quando `m05/dominio.ts` deixar de ser intocável.

## Pendências irmãs

- **`DDR-RETENCAO-CONSIGNACOES`** (MODULO.md do M07): com retenção, as pernas de
  controle vão pelo BRUTO. Refinar exige `8.2.1.1.3.02` e mudar
  `comporPagamentoComRetencoes`.
- **`DDR-GUARD-EMPENHO`**: o M01 **registra** o disponível negativo, não o recusa.
  Travar o empenho contra DDR insuficiente é decisão de domínio (e de política: há entes
  que empenham contra receita esperada), não desta fatia.
