# Contexto — `saas-municipal` e `siafic-cg`

> Documento de handoff para uma sessão nova de Claude Code.
> Gerado em 2026-09-09 por inspeção direta do código, não por documentação existente.
> Onde a documentação do repo diverge do que está no disco, o divergente está marcado.

Ambos os repositórios vivem em `/Users/winnervinicius/Developer/`.

---

## 0. Leia isto antes de qualquer coisa

Três fatos que mudam o que você pode fazer:

1. **`siafic-cg` NÃO está sob controle de versão.** Não existe `.git`. O
   `README-POC.md` cita commits (`3a08ae5…`) e a tag `poc-v1.0` como "HEAD
   definitivo" — esse histórico **não está no disco**. São ~124 mil linhas sem
   rede: qualquer edição é irreversível. **Rode `git init` e faça um commit
   inicial antes de tocar em qualquer arquivo.**
2. **`siafic-cg` não tem `node_modules`.** Nada roda até `npm install`.
   `saas-municipal` está instalado e verde.
3. **As portas 5432 e 6379 estão ocupadas por Postgres e Redis nativos** desta
   máquina, que escutam no *loopback*. Um container publicado em `0.0.0.0:5432`
   **perde** para eles: você conecta no Postgres nativo e recebe
   `role "..." does not exist`. `saas-municipal` já foi movido para **5434/6380**
   por causa disso. O `siafic-cg` ainda documenta 5432 e vai cair na mesma
   armadilha.

---

## 1. Os dois projetos em uma frase

| | `saas-municipal` | `siafic-cg` |
|---|---|---|
| O que é | SaaS **multi-tenant** de gestão pública municipal | SIAFIC **de um ente só**: contabilidade pública integrada |
| Cliente | Santa Izabel do Oeste/PR — Pregão 90023/2026 | Campina Grande/PB — Pregão 330/2026 (SEFIN) |
| Estágio | Produto em construção, módulo a módulo | **POC congelada** + base madura para produto |
| Tribunal | TCE/PR (SIM-AM) | TCE/PB (SAGRES) + TCM/BA (SIGA) |
| Tamanho | ~28,6k linhas TS | ~124k linhas TS |
| Testes | 116 verdes | 126 arquivos de teste (não executados nesta análise) |

**Domínio compartilhado, arquiteturas incompatíveis.** Os dois resolvem
orçamento público brasileiro (PPA/LOA, dotações, créditos adicionais, receita,
empenho→liquidação→pagamento, restos a pagar). Nenhum código é portável
diretamente entre eles — as fundações são opostas em quase toda decisão. O que
é reaproveitável é **conhecimento de domínio**, não implementação. Ver §5.

---

## 2. `saas-municipal`

### 2.1 Identidade

Monorepo pnpm + Turborepo. Multi-tenant por **schema-por-tenant** no Postgres:
um schema `public` com o cadastro de prefeituras, planos e módulos, e um schema
`tenant_<slug>` provisionado por cliente.

Git: repositório limpo, branch `main`, HEAD em `f92c2d3`.

### 2.2 Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node 20 / TypeScript strict / ESM |
| API | Fastify 5 + `fastify-type-provider-zod` (Swagger em `/docs`) |
| Web | Next.js (App Router) |
| Worker | BullMQ sobre Redis |
| ORM | **Drizzle** (`postgres-js`) |
| Validação | Zod |
| Testes | Vitest (integração contra Postgres real, sem mock de DB) |
| Auth | JWT em cookie httpOnly + refresh rotation + Argon2id + CSRF |

### 2.3 Layout

```
apps/
  api/      Fastify — 10,5k linhas, 63 arquivos
  web/      Next.js — 5,1k linhas, 44 páginas
  worker/   BullMQ  — 2,3k linhas
packages/
  auth/           hash de senha + JWT (253 linhas)
  database/       schemas Drizzle, migrations, seeds, tenancy (5k linhas)
  folha-engine/   motor de cálculo de folha, domain puro (5,4k linhas)
docs/
  ARCHITECTURE.md, DECISOES.md (ADR-001..017), MODULOS/{folha,orcamento}.md
```

`packages/database/drizzle/` tem duas trilhas de migration: `public/` (0000–0003)
e `tenant/` (0000–0009). Migration de tenant é aplicada a **todos** os schemas por
`pnpm db:migrate:tenants`.

### 2.4 O que está pronto

- **Camada 0** (fundação): auth master+tenant, RBAC, provisioning de schema,
  paginação cursor, cookies httpOnly, health check (`/health/live`,
  `/health/ready` com PG+Redis, `/health/info`), typecheck 6/6.
- **Orçamento**: PPA/LOA, programas, ações, dotações, créditos adicionais,
  importador de LOA por JSON.
- **Receitas**: naturezas, tipos, lançamentos, arrecadações, anulações.
- **Despesas**: empenho → liquidação → ordem de pagamento → pagamento, com
  workflow de aprovação e cascata de estorno.
- **Folha (B33–B35.5)**: cadastros (cargos, rubricas, vínculos), motor de
  cálculo (INSS, IRRF com os 3 cenários da Reforma Lei 15.270/2025,
  salário-família, 13º, proporcionalidade), worker BullMQ com 4 jobs,
  WebSocket de progresso, rotas REST completas, E2E ponta-a-ponta,
  smoke de ambiente.

### 2.5 O que NÃO está pronto

- Folha suplementar (13º/férias/rescisão) — tabelas existem, engine não (**B36**)
- UI da folha (cadastros, simulação, fechamento) — **B38**
- eSocial fase 3+4 (transmissão real) — **B40–B42**
- Camada 3 inteira: dashboards, RREO/RGF, índices constitucionais, transparência
- Navegação no web dirigida pelos módulos contratados do tenant

### 2.6 Convenções e armadilhas (custaram tempo — não repetir)

- **Drizzle: array em `sql` template não vira array.** `${arr}` expande para
  `($1, $2)` — um *record*. Em `= ANY(${arr}::uuid[])` o Postgres derruba com
  `cannot cast type record to uuid[]`. Use **`sql.param(arr)`**. Este bug
  quebrava a folha inteira em produção e passou por 102 testes verdes porque
  todos rodavam com zero vínculos (a função tem curto-circuito em lista vazia).
- **Nunca `pgSchema('public')` no Drizzle** — use `pgTable()`. O schema é
  resolvido em runtime por `createTenantDatabase(url, schemaName)`, que seta
  `search_path`. O identificador `tenant_template` só existe no *template* de
  migrations, nunca em query de runtime.
- **Nunca `::text` em UPDATE de coluna numeric** (H16). Enum passa string direto.
- **JSX no web:** evitar `-->` e `->` dentro de strings; usar `→`.
- **HTTP semântico:** 422 (não 409) para impossibilidade fiscal ou transição de
  estado inválida.
- **Período fiscal:** toda escrita passa por `assertPeriodoAberto`.
- **Auditoria:** reabertura e cancelamento gravam rastro (exigência do TCE).
- **Testes tocam banco de verdade** (ADR-014, *integration first*). Banco de
  teste na **5435**, tenant descartável por arquivo de teste.
- **`apps/worker` export raiz (`.`) sobe um worker no import.** Para usar um job
  em teste, importe o caminho específico (`@saas-municipal/worker/jobs/...`).
  Pelo mesmo motivo `FOLHA_QUEUE_NAME` mora em `queues/names.ts`, sem efeitos
  colaterais — `queues/folha.ts` instancia Queue e conexões no import.

### 2.7 Ambiente e comandos

```bash
pnpm install
docker compose up -d postgres postgres-test redis   # 5434 / 5435 / 6380

# .env e .env.test na raiz (copiados dos .example, com as portas acima)
pnpm db:migrate                                  # schema public
pnpm db:seed                                     # planos, módulos, super admin
pnpm -C packages/database db:seed:folha:publico  # tabelas federais INSS/IRRF/SF
pnpm db:bootstrap:test                           # banco de teste

pnpm typecheck                        # 6/6 pacotes
pnpm test                             # 28 — integração da API
pnpm -C packages/folha-engine test    # 81 — cálculo puro
pnpm -C apps/worker test              # 7  — smoke dos jobs
pnpm smoke                            # checagem read-only de ambiente
```

| Serviço | Porta | Credenciais |
|---|---|---|
| Postgres dev | **5434** | `saas:saas@localhost:5434/saas_municipal` |
| Postgres test | **5435** | `saas:saas@localhost:5435/saas_municipal_test` |
| Redis | **6380** | `redis://localhost:6380` |
| API | 3333 | — |
| Web | 3000 | — |

Tenant de dev: `santa-izabel-oeste` (schema `tenant_santa_izabel_oeste`, plano
`ouro`, 12 módulos). Login: `admin@prefeitura.local` / `TrocaIsso@2026!`.

> **Nota:** o tenant de dev existe mas está **vazio** (zero pessoas, vínculos e
> rubricas). Para dados de folha, a fonte canônica é a fixture
> `seedFolhaCalculoCompleto` em `apps/api/test/fixtures.ts`.

### 2.8 Onde ler primeiro

`ROADMAP.md` → `docs/DECISOES.md` (ADR-016 e ADR-017 explicam a folha inteira) →
`docs/MODULOS/folha.md`.

---

## 3. `siafic-cg`

### 3.1 Identidade

Monólito modular Next.js. **Um ente, não multi-tenant.** Arquitetura hexagonal
levada a sério: `dominio.ts` puro sem I/O, `ports.ts` com interfaces,
`adapter-prisma.ts` como única camada que conhece o banco.

O núcleo é um **ledger contábil de partidas dobradas append-only** — é isso que
diferencia este repo de tudo mais: cada fato do sistema (empenho, liquidação,
pagamento, arrecadação) gera lançamento contábil balanceado no PCASP.

### 3.2 Stack (o `PROJETO.md` diz "FIXO — não trocar")

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript strict, ESM |
| ORM | **Prisma 7** + PostgreSQL, schema multi-arquivo em `prisma/schema/` |
| Dinheiro | `decimal.js` no domínio / `Prisma.Decimal` na persistência |
| Validação | Zod 4 |
| Testes | Vitest 4 |
| UI | Next.js 15 + React 19 + Tailwind 4 |
| Arquitetura | Hexagonal — domain puro, ports, adapters na borda |

### 3.3 Os 4 invariantes não-negociáveis

Estes governam o repo inteiro. Violá-los é o tipo de erro que fecha o balanço e
mente:

1. **Dinheiro NUNCA é float/number.** `Decimal @db.Decimal(18,2)` no schema,
   `Decimal` no código. Alíquotas: `@db.Decimal(9,6)`. **Proibido** `+ - * /`
   nativos em valor monetário — use os helpers de `packages/contracts/money.ts`.
2. **Ledger append-only.** Lançamento contábil é imutável: nunca UPDATE, nunca
   DELETE. Correção = novo lançamento referenciando o original via `estornoDeId`.
   **Não existe `estornadoPorId`** — marcá-lo exigiria UPDATE no original.
   "Está estornado?" é derivado de `estornos.length > 0`.
3. **Idempotência** em toda entrada externa, garantida por unique constraint
   no banco (inbox: `@@unique([fonte, chaveIdemp])`; outbox: `@@unique([destino, chaveIdemp])`).
4. **Fail-closed.** Na dúvida, rejeite. Lançamento desbalanceado = erro, nunca grava.

### 3.4 O modelo do ledger: PERNA ÚNICA

Cada partida toca **uma** conta, com `tipo` = `DEBITO` ou `CREDITO`. Um lançamento
é um conjunto de pernas. Consequências que você precisa saber antes de escrever
qualquer coisa que grave no ledger:

- `ΣDÉBITO == ΣCRÉDITO` é invariante **real** a validar (num formato
  débito/crédito por linha seria estrutural e o check não pegaria nada).
- O balanceamento vale **dentro de cada subsistema** (orçamentário, patrimonial,
  controle). Sem isso, um orçamentário desbalanceado seria "compensado" por um
  patrimonial e o total fecharia mentindo.
- O `subsistema` da perna é validado contra o **1º dígito do código PCASP**
  (patrimonial 1–4, orçamentária 5–6, controle 7–8). Esse guard, quando entrou,
  revelou **85 falhas em 12 arquivos** — fixtures que usavam a conta errada.
- **⚠️ Um lançamento pode ter pernas de valores DIFERENTES.** Pagamento com
  retenção é composto: o caixa leva o **líquido**, as demais pernas o **bruto**.
  `gerarEstorno` produz o valor de **cada** perna — quem persiste **não pode**
  recarimbar um valor único por cima. Dois estornos do M08 faziam isso; era
  invisível (as pernas batiam entre si) mas devolveria ao caixa o bruto de um
  pagamento que só desembolsou o líquido.

### 3.5 Layout

```
PROJETO.md              visão macro + invariantes  ← LEIA PRIMEIRO
MODULO.template.md      template do manifesto de módulo
README-POC.md           o que a POC demonstra e o que ela NÃO prova
prisma/
  schema/               33 arquivos .prisma (_base + 1..n por módulo)
  migrations/           64 migrations versionadas
  sql/                  17 .sql aplicados FORA do Prisma (índices parciais, checks)
  seed/                 seeds oficiais (PCASP, STN, bootstrap de usuário)
packages/               contracts, ledger, estornaveis, locks, ofx, tribunais-core
modules/                17 módulos, cada um com MODULO.md
adapters/tribunais/     tce-pb (sagres, captura, consulta), tcm-ba
app/                    Next.js — 60 páginas, 15 route handlers
lib/                    portas da UI, pdf, csv, design, navegação
components/             22 componentes + MODULO-UI.md
test/                   infraestrutura da suíte (banco de teste isolado)
scripts/                smoke, POC, aplicação de SQL manual
docs/                   missao-poc, oficial/tce-pb, poc-fixtures
```

### 3.6 Módulos

O `PROJETO.md` numera M01–M18. **A tabela dele está desatualizada** em relação
ao disco — ele lista M09/M10/M11/M12/M13/M14 como "pendente", mas todos existem
com código e testes. O que está no disco:

| Módulo | Nome | Estado no disco |
|---|---|---|
| M01 | core-contábil (PCASP + ledger) | completo, com adapter, ports, roteiros, 5 arquivos de teste |
| M02 | planejamento (PPA/LOA/QDD, programação, reprevisão) | completo |
| M03 | créditos adicionais | completo |
| M04 | receita (natureza, arrecadação, reconhecimento) | completo |
| M05 | despesa (empenho→liquidação→pagamento) | completo, com guards de CMD e fonte |
| M06 | ordem cronológica de pagamento (art. 141) | completo |
| M07 | extraorçamentário (consignações, retenções) | completo |
| M08 | restos a pagar + encerramento de exercício | completo |
| M10 | patrimonial (bens, dívida, dívida ativa, almoxarifado, provisões) | completo |
| M11 | licitações / contratos / obras | completo |
| M12 | **relatórios — o maior módulo**: RREO (anexos 1,2,3,6,7,8,11,12,13,14), RGF (anexos 1–6), balanços, DVP, livros, MDE, ASPS | completo, ~40 arquivos de teste |
| M13 | transparência (datasets, CSV RFC-4180) | completo |
| M14 | exports federais (MSC, MANAD) | completo |
| M16 | travamento / autenticação / autorização / auditoria | completo |
| M17 | integração Banco do Brasil (OAuth, extrato, modos MOCK/SANDBOX/LIVE) | completo |
| M20 | importador parametrizável (folha, tributário) | completo |
| M09 | tesouraria | só schema `.prisma`, sem módulo |
| M18 | captura TCE-PB | vive em `adapters/tribunais/tce-pb/captura` |

### 3.7 Convenção de trabalho declarada pelo repo

> **1 sessão = 1 módulo.** Ao trabalhar num módulo, leia SOMENTE `PROJETO.md` e
> o `MODULO.md` do módulo alvo. Não leia nem altere outros módulos.

Alicerces compartilhados que qualquer módulo pode usar: `packages/contracts/`,
`packages/ledger/` e `prisma/schema/_base.prisma`.

Os `MODULO.md` deste repo são densos e valiosos — o do M01 documenta decisões
revertidas, o porquê de cada uma e as armadilhas que custaram tempo. **Leia o
MODULO.md antes do código**; ele frequentemente explica por que o código *não* é
o que você esperaria.

### 3.8 Armadilhas do Prisma 7 (documentadas como "custaram tempo")

- **`PrismaClient` exige driver adapter.** O query compiler está ligado (sem
  engine Rust): `datasourceUrl` e `datasources` **não existem** mais no
  construtor. Instancie via `@prisma/adapter-pg` — `criarPrismaClient(url)` no M01.
- **`prisma/migrations/` só aceita migrations.** Qualquer subpasta ali precisa de
  um `migration.sql`; um `.sql` avulso quebra o migrate com `P3015`. Por isso o
  SQL manual vive em **`prisma/sql/`** — e aplicá-lo é passo **obrigatório** em
  todo ambiente novo.
- **Índices parciais não geram drift.** O Prisma não os representa e os ignora no
  diff. Não "corrija" isso com `@unique`.
- **`moduleFormat: "esm"` + `importFileExtension: "js"`** no generator são
  obrigatórios: sem eles o NodeNext não resolve os imports do client gerado, os
  enums colapsam para `{}` e o backend explode com ~557 erros de tsc.

### 3.9 Banco de teste — proteção por código, não por convenção

A suíte **TRUNCA** as tabelas de domínio no `beforeEach`. Por isso ela usa
`DATABASE_URL_TEST`, nunca `DATABASE_URL`, e isso é **imposto**:
`test/db-teste.ts` aborta a suíte se `DATABASE_URL_TEST` faltar ou apontar para
o mesmo host+porta+database+schema que `DATABASE_URL`. O `setupFiles` reescreve
`process.env.DATABASE_URL` em cada worker — a suíte fisicamente não alcança o dev.

Testes rodam **serializados**: compartilham um banco e cada um limpa/semeia as
mesmas tabelas.

### 3.10 Como pôr para rodar (adaptado — o repo documenta 5432, que está ocupada)

```bash
cd /Users/winnervinicius/Developer/siafic-cg

git init && git add -A && git commit -m "chore: snapshot inicial"   # ← FAÇA ISTO PRIMEIRO
npm install

# O repo documenta -p 5432:5432. Use 5436 nesta máquina (5432/6379 são nativos,
# e 5434/5435/6380 já são do saas-municipal).
docker run --name pg-siafic -e POSTGRES_USER=siafic -e POSTGRES_PASSWORD=siafic \
  -e POSTGRES_DB=siafic_cg -p 5436:5432 -d postgres:18

# .env
# DATABASE_URL="postgresql://siafic:siafic@localhost:5436/siafic_cg?schema=public"
# DATABASE_URL_TEST="postgresql://siafic:siafic@localhost:5436/siafic_cg_test?schema=public"

npx prisma generate
npx prisma migrate deploy      # depois de TODO pull que traga migração
npm run db:sql                 # aplica prisma/sql/ — OBRIGATÓRIO em ambiente novo

npx tsc --noEmit -p tsconfig.backend.json   # typecheck backend
npx vitest run                              # suíte (cria o banco de teste sozinha)
npm run dev                                 # Next
```

Três tsconfigs distintos: `tsconfig.json` (app/Next), `tsconfig.backend.json`
(módulos e packages — o gate estrito), `tsconfig.scripts.json`.

### 3.11 A POC e o que ela deliberadamente NÃO prova

O `README-POC.md` mantém uma **hierarquia de evidência** honesta, e ela deve ser
preservada em qualquer coisa que você construa em cima:

| Evidência | Prova | **Não** prova |
|---|---|---|
| Golden byte a byte (TXT) | formatação determinística | aceitação do TCE |
| JSON válido no schema oficial | conformidade do contrato de dados | que o TCE recebeu |
| Manifesto SHA-256 | integridade local | procedência externa |
| Estado `SIMULATED` | simulação local | aceite/protocolo/recibo |
| `CREDENTIAL_NOT_CONFIGURED` | transporte pronto, sem credencial | canal funcionando |

Cada tela de integração exibe o modo permanentemente. **Nunca apresente prova
local como aceitação externa** — é regra explícita do projeto.

---

## 4. Comparação estrutural

| Dimensão | `saas-municipal` | `siafic-cg` |
|---|---|---|
| Tenancy | multi-tenant, schema por cliente | ente único |
| ORM | Drizzle | Prisma 7 |
| Dinheiro | `numeric` no banco, `number`/string no código | **`Decimal` obrigatório em todo lugar** |
| Contabilidade | não há ledger — módulos gravam tabelas próprias | **ledger de partidas dobradas é o núcleo** |
| Estorno | UPDATE de status + registro de anulação | lançamento novo, original imutável |
| Arquitetura | camadas por app (api/web/worker) | hexagonal por módulo (domain/ports/adapters) |
| Assincronismo | BullMQ + Redis + WebSocket | síncrono |
| Testes | integração contra Postgres, tenant descartável | integração contra Postgres, banco truncado |
| Folha de pagamento | **módulo completo com engine próprio** | apenas importador (M20) |
| Relatórios legais | **não existe** (Camada 3 pendente) | **RREO + RGF + balanços completos (M12)** |
| Documentação | ADRs centralizados em `docs/DECISOES.md` | `MODULO.md` por módulo, muito denso |

### As duas assimetrias que importam

- **`siafic-cg` tem o que falta no `saas-municipal`:** RREO, RGF, balanços, DVP,
  livros, MSC/MANAD, ordem cronológica, transparência, e o ledger contábil que
  dá lastro a tudo isso. É exatamente a "Camada 3" que o roadmap do
  `saas-municipal` lista como pendente.
- **`saas-municipal` tem o que falta no `siafic-cg`:** folha de pagamento com
  motor de cálculo próprio (INSS, IRRF, salário-família, 13º, eSocial S-1200/S-1202),
  processamento assíncrono para volume (15 mil servidores), e multi-tenancy.

---

## 5. Se a ideia é construir sobre esta estrutura

Antes de escolher caminho, uma decisão precisa ser tomada por quem conhece o
objetivo comercial — **não dá para inferir do código**:

**O alvo é um produto só ou dois?** As arquiteturas não convergem sem reescrita:
Drizzle vs Prisma, multi-tenant vs ente único, e sobretudo `number` vs `Decimal`
para dinheiro. Portar módulo entre os repos não é adaptação, é reimplementação.

Os caminhos plausíveis, com o custo real de cada um:

1. **Evoluir cada repo no seu trilho.** Custo baixo, duplicação alta. Faz sentido
   se os dois pregões são contratos independentes com prazos próprios.
2. **`siafic-cg` vira o produto e ganha multi-tenancy + folha.** O ledger e os
   relatórios legais são a parte cara e já estão prontos; multi-tenancy em Prisma
   é trabalho conhecido. A folha teria de ser reimplementada com `Decimal`.
3. **`saas-municipal` vira o produto e ganha ledger + relatórios.** Mais alinhado
   com o SaaS, mas significa reconstruir M01 e M12 — o coração do `siafic-cg`, e
   de longe a parte mais difícil e mais bem testada dos dois repos.
4. **Extrair um pacote comum de domínio fiscal** (tabelas federais, PCASP,
   classificações STN, layouts de tribunal). É o único ativo genuinamente
   compartilhável sem reescrita, e o de menor risco.

**Recomendação:** se o objetivo é um produto único, o caminho 2 preserva mais
valor — o ledger append-only com validação de subsistema e os 40 arquivos de
teste do M12 representam o conhecimento mais difícil de reconstruir dos dois
repositórios. A folha do `saas-municipal`, embora completa, é um domínio mais
fechado e mais fácil de reimplementar do que a contabilidade pública inteira.

Independente do caminho, faça primeiro:

- `git init` no `siafic-cg` — hoje ~124k linhas estão sem rede
- Reconciliar as portas de banco das duas stacks (5434/5435/6380 vs 5436)
- Corrigir a tabela de módulos do `PROJETO.md` do `siafic-cg`, que declara
  pendente o que já está construído

---

## 6. Estado verificado nesta análise

| Verificação | `saas-municipal` | `siafic-cg` |
|---|---|---|
| `node_modules` | ✅ instalado | ❌ ausente |
| Git | ✅ `main` @ `f92c2d3`, limpo | ❌ **não é repositório** |
| Typecheck | ✅ 6/6 pacotes | não executado (sem deps) |
| Testes | ✅ 116 verdes | não executados (sem deps e sem banco) |
| Banco dev | ✅ migrado e semeado (5434) | não provisionado |
| Banco teste | ✅ bootstrapped (5435) | não provisionado |

O que foi executado de fato: `pnpm typecheck`, `pnpm test`,
`pnpm -C packages/folha-engine test`, `pnpm -C apps/worker test` e `pnpm smoke`
no `saas-municipal`. No `siafic-cg` a análise foi **estática** — leitura de
código, schema e documentação, sem executar nada.
