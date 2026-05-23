# SaaS Municipal

> Plataforma multi-tenant de gestão financeira pública conforme **Lei 14.133/2021** e **LC 101/2000** (LRF).
> Base técnica para o **Pregão Eletrônico nº 90023/2026 — Município de Santa Izabel do Oeste/PR**.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20.11+ |
| Package manager | pnpm 9.15 |
| Monorepo | Turborepo |
| API | Fastify 5 + Zod + TypeScript |
| Banco | PostgreSQL 16 — **schema-per-tenant** |
| ORM | Drizzle 0.38 |
| Auth | Argon2id + JWT (jose) + refresh token rotation |
| Web | Next.js 15 (App Router) + Tailwind 3 |
| Infra dev | Docker Compose (Postgres + Redis + Mailpit) |

## Arquitetura

```
SaaS Municipal
├── apps/
│   ├── api/                 → Fastify (porta 3333)
│   └── web/                 → Next.js (porta 3000)
└── packages/
    ├── auth/                → Argon2 + JWT + RBAC
    └── database/            → Drizzle schemas + tenancy
        ├── schema/public.ts → metadados SaaS (tenants, plans, modules, master_users)
        └── schema/tenant.ts → template do schema de cada prefeitura
```

### Multi-tenancy

Cada prefeitura recebe um **schema PostgreSQL próprio** (`tenant_santa_izabel_oeste`, etc).
Isso garante:

- **Isolamento físico** dos dados — query cross-tenant impossível por design
- **Backup granular** — `pg_dump --schema=tenant_xxx`
- **Compliance** — LGPD facilita: exclusão = `DROP SCHEMA`
- **Performance** — índices menores, planos de execução mais eficientes

### Auth (master + tenant + RBAC)

- **Master users**: equipe interna do SaaS, gerencia tenants
- **Tenant users**: servidores da prefeitura, com roles e permissions
- **JWT** com claims tipadas (`typ: 'master' | 'tenant'`, `rol`, `prm`)
- **Refresh tokens** opacos, hash SHA-256 no banco, com **rotation** a cada uso
- **RBAC granular**: permission slug `modulo:acao` (ex: `receitas:write`) com wildcards

## Setup

### 1. Pré-requisitos

```bash
node -v   # >= 20.11
pnpm -v   # >= 9.15
docker -v
```

### 2. Clone e instale

```bash
pnpm install
cp .env.example .env

# Gere o AUTH_SECRET
echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env

# (opcional) defina seu primeiro super admin
echo "SEED_ADMIN_EMAIL=\"[email protected]\"" >> .env
echo "SEED_ADMIN_PASSWORD=\"TrocaIsso123!\"" >> .env
```

### 3. Suba a infra

```bash
pnpm docker:up
```

| Serviço | URL/porta |
|---|---|
| Postgres | localhost:5432 |
| Redis | localhost:6379 |
| Mailpit SMTP | localhost:1025 |
| Mailpit UI | http://localhost:8025 |

### 4. Gere e aplique as migrations

```bash
# Schema MASTER (public)
pnpm db:generate
pnpm db:migrate

# Schema TENANT (template) — NECESSÁRIO antes de criar a 1ª prefeitura
pnpm db:generate:tenant

# Seed master (planos, módulos, super admin)
pnpm db:seed
```

> ⚠️ O `db:generate:tenant` produz o SQL que será **automaticamente aplicado** em cada novo schema criado via API. Sem isso, a criação de tenant falha.

### 5. Suba API e Web

```bash
pnpm dev
```

- API: http://localhost:3333/health
- Web: http://localhost:3000
- Admin: http://localhost:3000/admin/login

## Criando a primeira prefeitura

### Via UI

1. Acesse http://localhost:3000/admin/login com `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
2. Clique em **+ Nova Prefeitura**
3. Preencha (exemplo Santa Izabel do Oeste/PR):
   - Slug: `santa-izabel-oeste`
   - Razão social: `Município de Santa Izabel do Oeste`
   - CNPJ: `76205665000101`
   - UF: `PR` · Cidade: `Santa Izabel do Oeste` · IBGE: `4124053`
   - Plano: Prata

O sistema executa em uma única transação:
1. `CREATE SCHEMA tenant_santa_izabel_oeste`
2. Aplica todas as migrations do schema template
3. Roda o seed baseline (6 roles + 10 permissions iniciais)
4. Vincula os módulos do plano contratado
5. Marca status `active`

### Via API

```bash
# 1. Login master
TOKEN=$(curl -sX POST http://localhost:3333/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"[email protected]","password":"TrocaIsso123!"}' | jq -r .accessToken)

# 2. Criar prefeitura
curl -X POST http://localhost:3333/admin/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "santa-izabel-oeste",
    "name": "Município de Santa Izabel do Oeste",
    "cnpj": "76205665000101",
    "state": "PR",
    "city": "Santa Izabel do Oeste",
    "ibgeCode": "4124053",
    "planSlug": "prata"
  }'
```

## Endpoints

### Master Admin
- `POST /admin/auth/login`
- `POST /admin/auth/refresh`
- `POST /admin/auth/logout`
- `GET /admin/auth/me`
- `GET /admin/tenants`
- `POST /admin/tenants` *(provisiona schema automaticamente)*
- `GET /admin/tenants/:id`
- `PATCH /admin/tenants/:id`
- `DELETE /admin/tenants/:id` *(soft delete)*
- `POST /admin/tenants/:id/archive` *(drop schema, exige `super_admin` + confirmação de CNPJ)*

### Tenant
> Todas as rotas exigem header `X-Tenant-Slug: <slug-da-prefeitura>` em rotas públicas
> ou token JWT com tenant id (em rotas autenticadas).

- `POST /tenant/auth/login`
- `POST /tenant/auth/refresh`
- `POST /tenant/auth/logout`
- `GET /tenant/auth/me`
- `POST /tenant/auth/change-password`
- `GET|POST /tenant/users`, `GET|PATCH|DELETE /tenant/users/:id`
- `POST|DELETE /tenant/users/:id/roles`
- `GET|POST /tenant/pessoas`, `GET|PATCH|DELETE /tenant/pessoas/:id`

## Próximos passos (Roadmap)

### ✅ Camada 1 — Fundação (concluída)
- [x] Tenants, Plans, Modules
- [x] Cadastros base (Pessoas PF/PJ, Entidades, Estruturas, Textos Jurídicos, Anexos)
- [x] Auth master + tenant + RBAC
- [x] Provisioning automático de schema

### 🔄 Camada 2 — Registro (próximo)
- [ ] **Receitas** (tributos, lançamentos, recebimentos)
- [ ] **Despesas** (Empenho → Liquidação → Pagamento)
- [ ] **Folha de Pagamento** (servidores, eventos, cálculo, geração de empenhos)

### Camada 3 — Inteligência
- [ ] Dashboards gerenciais
- [ ] RREO / RGF (LRF)
- [ ] Índices constitucionais (Saúde 15%, Educação 25%, Pessoal 54%)
- [ ] Portal de Transparência + Audiência Pública

## Compliance

- **LGPD**: schemas isolados + soft delete + audit logs
- **Lei 14.133/2021**: anexos S3 imutáveis + logs com hash
- **LC 101/2000 (LRF)**: bases para os relatórios fiscais na Camada 3
- **TCE/PR (SIM-AM)**: estrutura de entidades e códigos contábeis prevista

## Comandos úteis

```bash
pnpm docker:up         # sobe infra
pnpm docker:down       # derruba
pnpm docker:reset      # apaga volumes (CUIDADO!)
pnpm db:generate       # gera migrations do master
pnpm db:generate:tenant# gera migrations do template do tenant
pnpm db:migrate        # aplica migrations no master
pnpm db:seed           # popula planos/módulos/admin
pnpm db:studio         # abre Drizzle Studio em http://local.drizzle.studio
pnpm dev               # API + Web em modo dev
pnpm build             # build de produção
pnpm typecheck         # check de tipos em todo o monorepo
```

## Licença

Proprietário — uso restrito ao contratante.
