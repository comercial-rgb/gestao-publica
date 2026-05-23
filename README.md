# SaaS Municipal

Sistema fiscal multi-tenant para gestao publica municipal brasileira, em conformidade com **Lei 4.320/64**, **LRF (LC 101/2000)**, **Lei 14.133/2021** e padroes **STN/SICONFI/TCE-PR**.

> **Status**: em desenvolvimento ativo. Camadas Fundacao + Receitas + Orcamento completas. Proxima entrega: Despesas (empenho -> liquidacao -> pagamento).

## Visao geral

Cada municipio contratante e um **tenant** isolado em schema proprio no PostgreSQL. Master administra catalogo de modulos contrataveis e provisiona tenants; tenants operam suas proprias receitas, orcamento, despesas e folha.

```
+----------------------------------------------------------+
|  Master  (operacao SaaS)                                  |
|    +- catalogo de planos e modulos                        |
|    +- provisionamento de tenants                          |
|    +- auditoria global                                    |
+----------------------------------------------------------+
|  Tenant santa-izabel-oeste   (Prefeitura)                 |
|    +- schema: tenant_santa_izabel_oeste                   |
|    +- modulos ativos: cadastros, fiscal, receitas, ...    |
|    +- usuarios: admin_municipal, gestor_financeiro, ...   |
+----------------------------------------------------------+
|  Tenant outra-prefeitura                                  |
|    +- schema: tenant_outra_prefeitura                     |
|    +- ...                                                 |
+----------------------------------------------------------+
```

Detalhes tecnicos em [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20.11+ |
| Package manager | pnpm 9.15 + Turborepo |
| API | Fastify 5 + Zod + fastify-type-provider-zod |
| Database | PostgreSQL 16 (schema-per-tenant) |
| ORM | Drizzle ORM 0.38 |
| Cache / pub-sub | Redis 7 |
| Web | Next.js 15 (App Router) + Tailwind 3 |
| Auth | Argon2id + JWT (jose) + cookies httpOnly + CSRF |
| Testes | Vitest 2 (integration via fastify.inject) |
| Dev infra | Docker Compose (Postgres + Redis + Mailpit) |

## Conformidade fiscal

| Norma | Como o sistema atende |
|---|---|
| Lei 4.320/64 (orcamento publico) | PPA, LOA, dotacoes com classificacao STN completa, creditos suplementares |
| LRF (LC 101/2000) | Calendario fiscal com encerramento de meses, historico de alteracoes |
| Lei 14.133/2021 (licitacoes) | Vinculo de despesas a contratos (proxima camada) |
| MCASP 9a edicao | PCASP-PR seedado, modalidades de aplicacao STN, fontes de recurso oficiais |
| SICONFI / MSC | Campos `identificador_msc` em receitas e dotacoes desde o schema |
| TCE-PR | Importador de LOA via JSON (preparacao para XML) |

## Quickstart

### Pre-requisitos

- Node.js 20.11 ou superior
- pnpm 9.15 (`npm install -g pnpm`)
- Docker + Docker Compose

### Setup inicial

```bash
# 1. Clone
git clone [email protected]:comercial-rgb/saas-municipal.git
cd saas-municipal

# 2. Instalar dependencias
pnpm install

# 3. Configurar variaveis de ambiente
cp .env.example .env
cp .env.test.example .env.test
# Edite .env conforme necessario (AUTH_SECRET unico, etc)

# 4. Subir infraestrutura local
docker compose up -d
# Postgres dev: localhost:5434
# Postgres test: localhost:5435
# Redis: localhost:6380
# Mailpit (SMTP dev): localhost:8025 (UI) / 1025 (SMTP)

# 5. Bootstrap dos bancos
pnpm db:migrate              # schema master (public)
pnpm db:seed                 # planos, modulos, master admin
pnpm db:bootstrap:test       # banco de testes (porta 5435)

# 6. Subir aplicacao
pnpm dev
# API: http://localhost:3333 (Swagger em /docs)
# Web: http://localhost:3000

# 7. Validar
pnpm typecheck && pnpm test
# Esperado: 4/4 typecheck, 3/3 tests
```

### Credenciais iniciais (dev)

| Tipo | URL | Email | Senha |
|---|---|---|---|
| Master admin | http://localhost:3000/admin/login | `admin@saas.local` | `TrocaIsso@2026!` |
| Tenant (apos criar) | http://localhost:3000/login | gerado | gerado |

**Trocar essas senhas e obrigatorio antes de qualquer ambiente que nao seja dev local.**

### Provisionar primeiro tenant

```bash
# Via UI:
# 1. Login como master em /admin/login
# 2. /admin/tenants -> "+ Nova prefeitura"
# 3. Preencher: slug, nome, CNPJ, plano
# 4. Confirmar -- senha do admin do tenant e exibida UMA VEZ
```

## Estrutura do monorepo

```
saas-municipal/
├── apps/
│   ├── api/                   # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/        # admin/* e tenant/*
│   │   │   ├── plugins/       # auth, csrf, modules, redis, swagger
│   │   │   └── lib/           # fiscal, pagination, cookies, etc
│   │   └── test/              # vitest integration
│   └── web/                   # Next.js frontend
│       └── app/
│           ├── admin/         # rotas master
│           └── tenant/        # rotas do tenant logado
├── packages/
│   ├── database/              # schemas Drizzle + migrations + seeds
│   │   ├── src/schema/        # public.ts (master), tenant.ts (template)
│   │   └── drizzle/           # SQL migrations versionadas
│   └── auth/                  # password hashing + JWT + RBAC
└── docs/                      # documentacao
```

## Comandos uteis

### Desenvolvimento

```bash
pnpm dev                       # API + Web em paralelo
pnpm typecheck                 # tsc em todos os pacotes
pnpm test                      # vitest (suite integration)
pnpm test:watch                # vitest em watch
pnpm build                     # build de producao
```

### Banco de dados

```bash
pnpm db:generate               # gerar migration do master (apos mudar public.ts)
pnpm db:generate:tenant        # gerar migration do tenant template
pnpm db:migrate                # aplicar migrations no master
pnpm db:migrate:tenants        # aplicar em todos os tenants
pnpm db:migrate:tenants --dry-run

pnpm db:seed                   # planos, modulos, master admin
pnpm db:seed:pcasp-pr          # plano de contas PR em todos tenants
pnpm db:seed:orcamento-stn     # modalidades e fontes STN
pnpm db:seed:fiscal            # backfill de exercicio/meses
pnpm db:reseed:permissions     # re-aplicar baseline em tenants existentes
```

### Operacao

```bash
# Resetar admin de tenant orfao
curl -X POST http://localhost:3000/api/proxy/admin/tenants/<ID>/reset-admin \
  --cookie "sm_admin_access=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"...", "name":"...", "reason":"..."}'

# Importar LOA em massa via JSON
# /tenant/orcamento/importar (UI) -> drag-drop -> preview -> commit
```

## Modulos disponiveis

| Slug | Categoria | Status | Descricao |
|---|---|---|---|
| `cadastros` | fundacao | Pronto | Pessoas (PF/PJ), entidades, estruturas |
| `textos_juridicos` | fundacao | Pronto | Leis, decretos, portarias |
| `usuarios` | fundacao | Pronto | Gestao de usuarios do tenant |
| `fiscal` | fundacao | Pronto | Calendario (exercicios + meses) |
| `receitas` | registro | Pronto | PCASP, arrecadacao, contribuintes |
| `orcamento` | registro | Pronto | PPA, LOA, dotacoes, creditos |
| `despesas` | registro | Pendente | Empenho -> liquidacao -> pagamento |
| `folha` | registro | Pendente | Servidores + calculos |
| `relatorios_fiscais` | inteligencia | Pendente | RREO, RGF, indices LRF |

Catalogo completo: ver `packages/database/src/seed.ts`.

## Decisoes arquiteturais

As decisoes importantes estao documentadas em [`docs/DECISOES.md`](./docs/DECISOES.md). Resumo:

- **Schema-per-tenant** para isolamento fisico (LGPD + compliance)
- **PCASP por estado** (PR como primeiro, outros via novo seed)
- **Saldos armazenados** em colunas, atualizados em transacao (nao calculados em runtime)
- **Status fiscal de contribuinte** calculado em runtime (heuristica baseada em arrecadacoes/anulacoes)
- **Migrations commitadas no git** (auditabilidade para compliance fiscal)

## Documentacao

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) -- visao sistemica
- [`docs/DECISOES.md`](./docs/DECISOES.md) -- log de decisoes arquiteturais
- [`docs/MODULOS/orcamento.md`](./docs/MODULOS/orcamento.md) -- modulo Orcamento em detalhe

API docs (Swagger): rodando `pnpm dev`, acesse http://localhost:3333/docs

## Testes

```bash
pnpm test
# Suite atual: 3 testes integration cobrindo aplicacao de creditos orcamentarios
# Runtime: ~860ms
```

Estrategia de testes:
- **Integration first**: cada teste sobe `buildApp()` real + banco de teste isolado
- **Tenant descartavel**: cada suite cria seu proprio schema, drop ao final
- **JWT direto**: `signTestTenantToken()` evita fluxo de login em todo teste

Detalhes em `apps/api/test/`.

## Contribuindo

Este e um projeto privado. Padroes internos:

- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)
- `pnpm typecheck` obrigatorio antes de commit
- `pnpm test` obrigatorio quando mexer em rotas com cobertura
- Sem `any` em codigo novo
- Sem `console.log` em commit (use o logger do Fastify)
- Soft delete por padrao (nao DELETE fisico, exceto LGPD compliance)
- Migrations Drizzle sao imutaveis apos commit/apply. Use `pnpm db:generate` para criar novas; nunca edite `.sql` em `packages/database/drizzle/`

## Licenca

Proprietario. Todos os direitos reservados.
