# M02 — planejamento

Ficha orçamentária (dotação) e receita prevista. Abordagem **híbrida**: núcleo
conceitual MCASP com os campos do layout **SAGRES-PB (TCE-PB)** já embutidos —
gerar `Dotacao.txt` e `ReceitaPrevista.txt` depois é um SELECT direto, sem
camada de tradução.

**Status: 2b — ajuste de schema.** O seed oficial (tabelas STN completas) é a
próxima sessão. Aqui só existe um seed MÍNIMO, de teste.

## Requisitos TR cobertos

- TR **4.1–4.7** (planejamento / ficha orçamentária) — parcial: a estrutura
  classificatória e o valor dotado. PPA/LDO/LOA e anexos ficam no M02b.
- TR **4.58** (receita prevista).

## Depende de

- **M01 core-contabil** — `criarPrismaClient()` (Prisma 7 exige driver adapter;
  instanciar `new PrismaClient()` é proibido) e a `PartidaContabil`, à qual este
  módulo adiciona a coluna `fichaId`.
- `packages/contracts` — `Money`/`Decimal`, `zMoney`.

## Invariantes (NUNCA violar)

1. **DINHEIRO = Decimal.** `valorDotado` e `valorPrevisto`:
   `Decimal @db.Decimal(18,2)`. `zMoney` rejeita `number` na entrada; o valor
   cruza a fronteira do Prisma como string de 2 casas.
2. **ADITIVO AO M01.** A `PartidaContabil` ganhou **só** `fichaId String?` +
   relação + índice. Nenhuma coluna existente do M01 mudou; nenhuma tabela foi
   recriada. Verificado no SQL da migration: `ALTER TABLE "PartidaContabil" ADD
   COLUMN "fichaId" TEXT;` — e nada mais. O append-only do M01 segue intacto.
3. **A FICHA é a unidade.** A partida referencia UMA ficha por `fichaId` — não
   carrega 10 colunas de classificação soltas. Saldo / reserva / empenhado
   **não** moram aqui (são M05); a ficha guarda só a estrutura classificatória e
   o valor DOTADO (fixado pela LOA).
4. **FIEL AO SAGRES-PB.** A chave `uq_ficha_sagres` reproduz a chave da tabela
   `Dotacao` do TCE-PB. Não existe nível "Região". A natureza da despesa é
   **4 componentes** (categoria + natureza + modalidade + elemento), não uma FK
   única — `codigoCompleto` é derivado, e `conferirCodigoNaturezaDespesa()`
   garante que não divirja das partes.
5. **FAIL-CLOSED.** Ficha sem componente obrigatório = rejeitar (Zod). Componente
   cujo código não existe no plano = rejeitar (nunca criar implicitamente).
   Valor negativo = rejeitar. Classificação duplicada no exercício = rejeitar
   (o banco impõe via `uq_ficha_sagres`; o adapter traduz o erro).
6. **ÓRGÃO = PREFIXO DA UO.** `Orgao.codigo` é `VarChar(2)`: no padrão
   brasileiro a UO é **ÓÓUUU**, então o órgão são os 2 primeiros dígitos dela.
   Invariante: `orgao.codigo == unidadeOrc.codigo[0:2]`. Aplicado no **domínio**
   (Zod), não no serviço — ele é derivável só dos códigos de entrada, então
   rejeita **antes de qualquer I/O**. Convive com a checagem
   `conferirCoerenciaOrgaoUnidade()` do serviço, e as duas são complementares:
   a do domínio pega **código** incoerente; a do serviço pega **banco**
   incoerente (a UO cadastrada sob outro órgão).

## Máquinas de estado

**Nenhuma.** Ficha e receita prevista são estrutura, não processo. O ciclo
reserva → empenho → liquidação → pagamento é do M05.

## Decisões conscientes (não são esquecimentos)

- **`coId` fica FORA de `uq_ficha_sagres`.** No Postgres, unique com coluna
  nullable trata `NULL`s como **distintos entre si** — duas fichas idênticas com
  `co = NULL` passariam pela constraint e furariam a integridade justamente no
  caso mais comum. Se o CO precisar entrar na unicidade, será via **índice único
  parcial**, o padrão do projeto para o que o Prisma não expressa (ver
  `prisma/sql/` no M01).
- **`orgaoId` na ficha é DENORMALIZADO.** A UO já aponta para o órgão; o SAGRES
  exporta os dois, então guardamos os dois — mas isso abre espaço para
  divergência (`ficha.orgao != ficha.unidadeOrc.orgao`). O serviço fecha isso:
  `conferirCoerenciaOrgaoUnidade()` rejeita a ficha se o órgão declarado não for
  o dono da UO. Sem essa checagem, o `Dotacao.txt` sairia com um órgão que não é
  o da unidade — e o TCE rejeitaria, ou pior, aceitaria errado.
- **Model `CO` renomeado para `CodigoAcompanhamento`.** Um model de 2 letras vira
  o acessor `prisma.cO`, ilegível para quem (humano ou IA) ler depois — e
  legibilidade é a premissa do projeto. O campo na ficha continua `coId`,
  preservando o vocabulário SAGRES onde ele importa (a exportação).
- **`TipoReceita` DESACOPLADO do código do TCE.** A `ReceitaPrevista` guarda o
  **enum conceitual MCASP** (`ORCAMENTARIA | INTRA_ORCAMENTARIA | DEDUCAO`), que
  é a regra de negócio e é estável. O código literal do SAGRES vive na tabela
  de-para `TipoReceitaSagres` (`tipoInterno` @unique ↔ `codigoSagres` @unique), e
  a tradução é um **join feito só na exportação**.
  Por quê: o SAGRES já renumerou no passado (TipoMeta virou NaturezaContratacao;
  tipoFonteRecurso virou 2 campos). Amarrar a regra de negócio ao número do TCE
  transformaria **cada mudança do TCE em migração de dados** em toda a base de
  receitas. Com o de-para, uma renumeração é um UPDATE de 3 linhas.
  Mesmo padrão já usado em `CodigoAcompanhamento`/`coId` e em
  `FonteRecurso.codigoTce`/`codigoStn`. Há teste provando que a `ReceitaPrevista`
  grava mesmo **sem nenhum mapeamento existir** — o desacoplamento em ação.
- **`Subelemento` já modelado, mas não usado.** Ele aparece no EMPENHO (M05).
  Está aqui para não virar migração depois.

## Seed oficial

`prisma/seed/m02-seed-oficial.ts` (`npm run seed:m02`) — IDEMPOTENTE (upsert por
código) e FAIL-CLOSED (valida formato de TODOS os códigos antes de gravar
qualquer linha; um código torto aborta o seed inteiro, não grava metade).

| Tabela | Linhas | Fonte |
| --- | --- | --- |
| `Funcao` | 29 | Portaria 42/1999 (28 funções + 99 Reserva de Contingência) |
| `Subfuncao` | **111** | 109 da Portaria 42/1999 consolidada + `997` (Reserva do RPPS) e `999` (Reserva de Contingência), da **STN 163/2001 art. 8º** |

As duas reservas **não constam da Portaria 42** — vêm da 163/2001, e estão
marcadas como tal no array. Sem elas não haveria como classificar a Reserva de
Contingência (que tem `Funcao` 99, mas nenhuma subfunção correspondente na
Portaria 42) nem a Reserva do RPPS.

**REVOGADAS, nunca semear:** `601`–`604` (Agricultura). A consolidação de 2022 as
fundiu em `608` (Promoção da Produção Agropecuária) e `609` (Defesa
Agropecuária). O seed **aborta** se elas reaparecerem na lista.

| `NaturezaDespesa` | 12 | montadas dos componentes (163/2001) |

### Componentes da natureza — const arrays, NÃO tabelas

O schema não tem model para categoria/grupo/modalidade/elemento: a
`NaturezaDespesa` guarda os 4 como CAMPOS. Eles vivem em
`prisma/seed/dados/` como const arrays tipados, e são **o rol contra o qual
`montarNatureza()` valida** (fail-closed):

| Componente | Qtd | Arquivo |
| --- | --- | --- |
| Categoria econômica | 2 | `natureza-componentes.ts` |
| Grupo de natureza (GND) | 6 | `natureza-componentes.ts` |
| Modalidade de aplicação | 22 | `natureza-componentes.ts` |
| Elemento de despesa | 78 | `elementos.ts` — rol **fechado**, confirmado no Anexo II |

**A `NaturezaDespesa` nunca é digitada à mão.** `NATUREZAS_COMUNS` declara só os
4 componentes; `codigoCompleto` e `descricao` são DERIVADOS (a descrição é o nome
do elemento). Assim os dois não podem divergir — e `montarNatureza()` **lança** se
qualquer componente não existir no rol.

### ⚠️ COLISÃO elemento × modalidade

Os códigos **32, 46, 67, 73, 93, 94** existem nos DOIS domínios com significados
**diferentes**: elemento `46` = Auxílio-Alimentação; modalidade `46` = fundo a
fundo SUAS. São posições distintas da natureza (`codElemento` vs
`codModalidade`) e não podem se contaminar. `montarNatureza()` busca o elemento
**sempre** em `ELEMENTOS`, nunca em `MODALIDADES_APLICACAO`, e há teste provando
que `3.3.90.46` sai como "Auxílio-Alimentação" (não "SUAS") e que
`3.3.46.46` guarda os dois `46` sem se misturar.

### Modalidades: 22 (corrigidas na 2d)

19 do Anexo II da 163/2001 + **46, 67, 73**, que vêm de portarias posteriores à
163 base e estão marcadas como tal no seed (confirmar no MCASP vigente).
**REVOGADAS, o seed aborta se voltarem:** `35` e `45` — substituídas por `31`
("Transferências a Estados e ao Distrito Federal - Fundo a Fundo") e `41`
("Transferências a Municípios - Fundo a Fundo"), textos oficiais do Anexo II.

### RESOLVIDO: a suíte não toca mais o banco de dev

Durante três sessões, `vitest run` truncava as tabelas de domínio e apagava o
seed. **Corrigido na 2c-final**: a suíte roda num banco isolado
(`DATABASE_URL_TEST`), e `test/db-teste.ts` ABORTA se essa variável faltar ou
apontar para o mesmo banco que `DATABASE_URL`. Provado: dev fica em 29/111 antes
e depois de rodar a suíte inteira. Ver `docs/instrucoes/arquitetura.md`.

## Dotação inicial EAGER (Parte 5-fix)

**Ao criar a ficha, o adapter cria também o `MovimentoDotacao(DOTACAO_INICIAL)`
com `valor = valorDotado`, na MESMA transação**, e recalcula as colunas de saldo.

**O bug que isso corrige:** a `DOTACAO_INICIAL` era semeada **preguiçosamente**,
na primeira operação de saldo (M05). Uma ficha nunca reservada/empenhada/creditada
não tinha movimento nenhum — e portanto reportava **`saldoAutorizado = 0`**, não o
`valorDotado` que a LOA fixou. Nenhuma **escrita** era comprometida (todo caminho
de escrita semeava antes de checar, e o erro era fail-safe), mas qualquer
**demonstrativo de saldo mostrava zero** para as fichas intocadas — erro de
conformidade num relatório que vai ao TCE.

Conceitualmente: **a dotação da LOA é um fato do momento em que a ficha passa a
existir**, não do momento em que alguém a usa.

**Idempotência: índice único parcial no banco**
(`prisma/sql/uq_dotacao_inicial_unica.sql`), não checagem na transação. Motivo: um
`count() == 0` dentro da transação **não fecha a corrida** sob READ COMMITTED —
duas transações concorrentes leem zero e ambas inserem, e a dotação passa a ser
contada **duas vezes** no `saldoAutorizado`. Dinheiro que não existe, aparecendo no
orçamento. O índice único vê sempre. É **parcial** porque os demais tipos de
movimento se repetem à vontade na mesma ficha.

**Backfill:** `modules/m02-planejamento/backfill-dotacao-inicial.ts` (script em
`prisma/seed/backfill-dotacao-inicial.ts`, `npx tsx`). Idempotente: só toca fichas
sem `DOTACAO_INICIAL`, corrige o SUM **e** o cache, e falha se ao final sobrar
alguma ficha sem. Testado: roda 3x sem duplicar, e não reescreve a dotação de
fichas que já a tinham.

## Pendências / riscos conhecidos

- **PENDÊNCIA DE DADO (não de estrutura): `TipoReceitaSagres.codigoSagres`.**
  A estrutura está fechada e testada; faltam só os **3 valores literais** da
  tabela SAGRES **5.23 "TipoReceitaLancada"**. Fonte: GitLab do TCE-PB —
  bloqueado a crawler, requer navegador ou token da ASTEC
  (`suportesagres@tce.pb.gov.br`). Nos testes os códigos são `PLACEHOLDER-*`;
  o que se testa é a unicidade dos dois lados do de-para, não os valores.
  Preencher esses 3 valores **não** exige migração de dados — é o ponto inteiro
  do desacoplamento.
- **INVERSÃO DE CAMADA: o adapter do M02 importa `recalcularCache` do M05.** As
  colunas de saldo vivem na `FichaOrcamentaria` — que é model do **M02** — mas o
  mecanismo que as recalcula nasceu no **M05**. O M02 é dependência do M05, então
  esta importação inverte a hierarquia (não há ciclo em runtime, mas o desenho está
  torto). **Correção recomendada:** descer o mecanismo de saldo (`calcularSaldos`,
  `totaisPorTipo`, `recalcularCache`) para o M02 ou para um pacote compartilhado —
  M03 e M05 viram consumidores.
- **`garantirDotacaoInicial()` do M05 continua nos caminhos de escrita** como
  no-op defensivo. Removê-lo só depois de confirmar que TODO caminho de criação de
  ficha passa pelo adapter do M02 (hoje vários testes criam fichas direto pelo
  Prisma, o que continuaria produzindo fichas sem dotação).
- **`Subelemento` continua sem seed.** Aparece no empenho (M05).
- **Só 12 `NaturezaDespesa`** — as comuns. O produto cartesiano completo
  (categoria × grupo × modalidade × elemento) não foi gerado; naturezas novas se
  acrescentam declarando os 4 componentes em `NATUREZAS_COMUNS`.
- **O M01 ainda não sabe GRAVAR `fichaId`.** A coluna existe e a FK funciona
  (provado em teste), mas `PartidaParaPersistir` do M01 não tem o campo — nenhum
  caso de uso popula a ficha ainda. É deliberado: quem precisa disso é o M05
  (empenho), e o passo será **aditivo também no M01** (`fichaId?` opcional na
  port). Não foi feito aqui porque o spec proíbe reescrever o M01.

## Arquivos deste módulo

- `prisma/schema/m02-planejamento.prisma` — enums `TipoAcao`, `TipoReceita`;
  domínio da classificação (`Orgao`, `UnidadeOrcamentaria`, `Funcao`,
  `Subfuncao`, `Programa`, `Acao`, `NaturezaDespesa`, `Subelemento`,
  `FonteRecurso`, `CodigoAcompanhamento`), `FichaOrcamentaria`,
  `NaturezaReceita`, `ReceitaPrevista`, `TipoReceitaSagres` (de-para).
- `prisma/schema/m01-core-contabil.prisma` — **apenas** o bloco aditivo
  `fichaId` + relação na `PartidaContabil`.
- `modules/m02-planejamento/dominio.ts` — Zod + `comporFicha` /
  `comporReceitaPrevista` / `conferirCodigoNaturezaDespesa` (**sem I/O**).
- `modules/m02-planejamento/ports.ts` — `ClassificacaoRepositoryPort`,
  `FichaRepositoryPort`, `ReceitaPrevistaRepositoryPort`, `M02Deps`.
- `modules/m02-planejamento/servico.ts` — `criarFicha`, `criarReceitaPrevista`.
- `modules/m02-planejamento/adapter-prisma.ts` — única camada com Prisma.
- `modules/m02-planejamento/seed-minimo.ts` — seed de TESTE (não é o oficial).
- `modules/m02-planejamento/m02.test.ts` — puros, com fakes (sem banco).
- `modules/m02-planejamento/m02.integracao.test.ts` — Postgres real: unicidade
  `uq_ficha_sagres` e a prova de ADITIVIDADE (partida com e sem ficha no mesmo
  lançamento).

## Fora de escopo aqui

- **PPA / LDO / LOA e anexos MDF** → M02b.
- **Saldo, reserva, empenho, liquidação, pagamento da ficha** → M05. A ficha aqui
  não tem saldo — só valor dotado.
- **Limites constitucionais** (educação, saúde, pessoal) → M02b / relatórios.
- **Seed oficial da classificação** (Portaria 42/99, Portaria 163, naturezas de
  receita, fontes TCE-PB) → sessão M02a-seed.
- **Gravar `fichaId` na partida a partir de um caso de uso** → M05.

## V29 — a proposta orçamentária do exercício seguinte (`proposta-orcamentaria.ts`)

Tela: Planejamento › Proposta Orçamentária (`/planejamento/proposta-orcamentaria`). Pedido em
`docs/lotes/V29-proposta-orcamentaria.md`; a referência funcional é a "Implantação do Orçamento Programa para o
Próximo Exercício" do sistema que o município usa hoje (ver `docs/lotes/V30-esperanca-dois-dias.md`).

**Por que não é cópia de fichas.** Criar ficha grava a dotação inicial no razão (1º de janeiro). A proposta ainda
muda até a votação; se ela fosse ficha, cada mudança seria crédito adicional. Então:

1. **elaborar** importa o exercício de origem com escolhas explícitas: o que aproveitar (receitas, fichas ou as
   duas), o valor de partida (receita: previsão inicial, atualizada com as reprevisões, ou só a estrutura; despesa:
   dotação inicial, autorizada, empenhado até a importação, ou só a estrutura), o reajuste de cada lado, se projetos
   e operações especiais levam o reajuste, e se entram as fichas exclusivas da origem (abertas por crédito especial
   ou extraordinário com dotação inicial zero, e as de recurso de exercício anterior — fora por padrão). Cada linha
   guarda a lei de origem, a partida e o projetado. Nada toca o razão.
2. **ajustar** grava um ajuste append-only com motivo; o vigente é o último.
3. **efetivar** cria a receita prevista e as fichas do destino pelo mesmo corpo da criação manual
   (`criarFichaNaTransacao`), numa transação, uma vez por exercício (`EfetivacaoDaProposta` única por proposta e por
   exercício). Pré-condições antes do primeiro `create`: exercício aberto, destino sem ficha nem receita, nenhuma
   linha negativa. Linha com valor zero não entra.

**Autorização.** Elaborar e ajustar: CADASTRAR_LOA no ente. Efetivar: CRIAR_FICHA em cada unidade que recebe ficha e
CRIAR_RECEITA_PREVISTA no ente. Nenhuma ação nova. A abertura do exercício (M08 `abrirExercicio`, ABRIR_EXERCICIO)
ganhou botão na própria proposta.

**Concorrência.** Ajustar e efetivar travam a proposta (`packages/locks`, posto `PropostaOrcamentaria`).

**A receita é líquida.** A dedução entra nos totais com o sinal de `SINAL_PREVISAO`.

**Pendências nomeadas.**
- `PROPOSTA-A-PARTIR-DO-PPA-OU-DA-LDO` — as opções "criar com base na LDO/PPA" da referência não existem.
- `PROPOSTA-RECEITA-ARRECADADA-NAO-PREVISTA` — incluir receitas arrecadadas sem previsão (previsto = arrecadado):
  a linha da proposta exige uma previsão de origem; precisaria de linha sem origem.
- `PROPOSTA-SUBTIPO-DA-DEDUCAO` — o subtipo da dedução (SAGRES §5.23) não é copiado: ele é registrado no destino
  pela tela da receita prevista, com o documento da lei nova; a proposta efetivada mostra quantas faltam.
- `PROPOSTA-CONFERENCIA-ANTES-DA-VOTACAO` — a conferência do orçamento proposto (MDE, FUNDEB, Saúde, soma das fichas
  por ação) ainda é feita pelas telas de consistência sobre as fichas, isto é, depois da efetivação.
- `PROPOSTA-AJUSTE-EM-LOTE` — ajuste por filtro (unidade, fonte, natureza) com prévia ainda não existe; o ajuste é
  por linha.
- `PROPOSTA-VERSAO-DO-PROJETO` — a versão do projeto encaminhado (M02b) fotografa as fichas; antes da efetivação
  ela ainda não fotografa a proposta.
- O tempo da efetivação com a LOA real de Esperança não foi medido; o limite da transação é 120 s.

## V35 — fontes oficiais, carga da LOA aprovada e a previsão da receita no razão

- **Fontes e CO** (`fontes-oficiais.ts`, tela Planejamento › Fontes de recurso): carga da tabela da STN 2026, só
  acrescenta, natureza do controle pelo bloco oficial.
- **Carga da LOA** (`carga-da-loa.ts`): QDD e receita prevista extraídos da lei e conferidos contra os totais dela
  (Esperança: `docs/oficial/esperanca-pb/*-DERIVADO.csv`). Estrutura que falta é cadastrada; fichas pelo `criarFicha`.
- **Previsão da receita no razão** (`previsao-no-razao.ts`): a receita (orçamentária e intra) lança D 5.2.1.1.1 /
  C 6.2.1.1 ao ser criada; a dedução lança D 6.2.1.1 / C 5.2.1.1.2.01.01 (FUNDEB) ou .99.00 ao receber o detalhe
  com o tipo; a efetivação da proposta faz o mesmo. Fato de 1º de janeiro, como a dotação. Antes a classe 6.2.1.1
  ficava negativa na arrecadação e a MSC saía sem previsão.
- **Pendente:** previsões de bases antigas (criadas antes da V35) não têm lançamento; a reprevisão (LRF art. 12)
  continua fora do razão.

## V35 — a reprevisão da receita no razão

Antes, a reprevisão só gravava a linha (`ReceitaReprevista`): os relatórios somavam a previsão atualizada, e o razão
ficava na previsão inicial. A 6.2.1.1 da MSC divergia da coluna "previsão atualizada" do RREO.

Agora `reprevisar` grava a linha e o lançamento na mesma transação (`lancarReprevisaoDaReceita`, origem
`REPREVISAO_DA_RECEITA`, na data do ato). Contas do PCASP do TCE-PB 2025:
- aumento: D 5.2.1.2.1.01.00 REESTIMATIVA / C 6.2.1.1.0.00.00 RECEITA A REALIZAR;
- redução: D 6.2.1.1.0.00.00 / C 5.2.1.2.9.00.00 (-) ANULAÇÃO DA PREVISÃO DA RECEITA.

Fail-closed: conta ausente ou sintética no plano recusa, sem gravar a linha. Teste `m02-reprevisao.test.ts` t-razão
(+20.000 e −3.000), mutação provada (redução lançada como aumento: vermelho).

**A reprevisão de DEDUÇÃO (V35, fechada):** vai ao razão na conta do tipo da dedução, lido do detalhe da linha da LOA
(o mesmo que escolhe a conta da previsão inicial): tipo 3 → 5.2.1.2.1.03.01 (-) FUNDEB; os demais → 5.2.1.2.1.99.00
(-) PREVISÃO DE OUTRAS DEDUÇÕES DA RECEITA, ambas sob 5.2.1.2.1 PREVISÃO ADICIONAL no PCASP do TCE-PB 2025. Como a
dedução é redutora, o aumento sai D 6.2.1.1 / C a dedução e a redução, o inverso (espelho da previsão inicial
D 6.2.1.1 / C 5.2.1.1.2.xx). O MCASP não traz o lançamento da reestimativa de dedução; a conta vem do plano e o sentido,
da natureza credora da redutora. Sem detalhe (ou sem linha de dedução para a natureza e fonte), RECUSA com o motivo —
antes, a linha era gravada sem lançamento. Teste t-dedução (N=2 no tipo; negação com o motivo nos dois casos);
mutações provadas: sinal, escolha do tipo e recusa. O guard do plano oficial colhe as duas contas (`reestimativa:`/
`anulacao:`), mutação provada.

**Pendência nomeada:**
- bases anteriores à V35: previsões e reprevisões gravadas sem lançamento não são reprocessadas. A produção de
  Esperança foi configurada já com a previsão no razão.

## V36 — a previsão da receita da LOA por rateio (TR 5.9.3.7)

`previsao-por-rateio.ts` (`preverReceitaPorRateio`, sob CRIAR_RECEITA_PREVISTA). O operador informa a natureza e o
valor; o serviço reparte pela composição vigente da natureza (M04, `fontes-da-natureza.ts`) e grava uma previsão por
fonte com o lançamento de 1º de janeiro (D 5.2.1.1.1 / C 6.2.1.1, as constantes de `criarReceitaPrevista`). Tela: o
formulário na `/planejamento/receita-prevista`, só com as naturezas de composição completa.

- Tudo ou nada: exercício aberto (`exigirExercicioAberto`), composição de 100% e nenhuma previsão já gravada para as
  fontes são conferidos antes de gravar; a corrida que passa pela conferência cai na chave única e desfaz o rateio
  inteiro, nomeando a fonte (t7, determinístico).
- A parte que trunca a zero não vira previsão. Natureza de categoria 7 ou 8 é intraorçamentária (o critério da carga).
- **Pendência nomeada `PREVISAO-LINHA-A-LINHA-SEM-GUARDA-DE-EXERCICIO`:** o `criarReceitaPrevista` (adapter
  `criarReceitaPrevistaRepositoryPrisma`) grava a previsão e o lançamento de 1º de janeiro sem conferir o exercício
  aberto. Hoje ele só é alcançado pela carga da LOA e por scripts; acrescentar a guarda mexe nesses chamadores e é
  unidade própria (achado da auditoria do rateio, 07/10/2026).
