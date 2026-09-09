# Roadmap — SaaS Municipal

> Pregão Eletrônico nº 90023/2026 — Município de Santa Izabel do Oeste/PR

Este documento acompanha a evolução da **Camada 0 (Fundação técnica)** e das camadas funcionais do produto.
Para setup e arquitetura, veja [README.md](./README.md).

---

## Status atual

### Hotfixes aplicados (H1–H8)

| Hotfix | Descrição | Status |
|--------|-----------|--------|
| **H1** | Redirect tenant após login (`/login` → `/tenant/dashboard`) | ✅ |
| **H2** | Status code preservado no error handler (403/401 não viram 500) | ✅ |
| **H3** | `.env.example` documentado (portas, seed, middleware) | ✅ |
| **H4** | `POSTGRES_PORT` / `REDIS_PORT` validados em `apps/api/src/env.ts` | ✅ |
| **H5** | Rate-limit distribuído via Redis (`@fastify/redis` + `@fastify/rate-limit`) | ✅ |
| **H6** | `env.ts` robusto — resolve `.env` via `import.meta.url` (funciona de qualquer cwd) | ✅ |
| **H7** | Middleware Next.js preparado (`apps/web/middleware.ts`, modo permissivo/estrito) | ✅ |
| **H8** | Paginação cursor-based (`items` + `pagination.nextCursor`) | ✅ |

---

## PRÓXIMO PASSO RECOMENDADO

### → Bloco B36 — Folhas suplementares (13º, férias, rescisão)

O módulo Folha fechou o ciclo mensal completo no **B35.5**: engine, worker
BullMQ, rotas REST, WebSocket de progresso, E2E ponta-a-ponta e smoke de
ambiente. As tabelas `folhas_ferias` e `folhas_rescisoes` já existem no schema,
mas ainda não têm engine nem rotas.

Antes de B36, dois débitos técnicos herdados do B35 (ver ADR-016/017):

1. **Teto agregado INSS** — o orquestrador precisa chamar
   `aplicarTetoAgregadoInss` para pessoas com mais de um vínculo RGPS
2. **IRRF pré-2024** — placeholder em `desconto_simplificado` (migration 0004)

## Camada 0 — Fundação técnica

Blocos incrementais que precedem os módulos funcionais (Receitas, Despesas, Folha).

| Bloco | Descrição | Status |
|-------|-----------|--------|
| **0.1** | Schema master (tenants, plans, modules, master_users) | ✅ Concluído |
| **0.2** | Auth master + tenant + RBAC (JWT, refresh rotation, Argon2id) | ✅ Concluído |
| **0.3** | Provisioning automático de schema por tenant | ✅ Concluído |
| **0.4** | Cadastros base no schema tenant (pessoas, entidades, textos jurídicos…) | ✅ Concluído |
| **0.5** | UI admin (login, dashboard, CRUD de prefeituras) | ✅ Concluído |
| **0.6** | Paginação cursor-based nas listagens da API | ✅ Concluído (H8) |
| **0.7** | Cookies httpOnly (substituir localStorage) | ✅ Concluído — `Set-Cookie` em admin/tenant auth + CSRF; sem `localStorage` no web |
| **0.8** | Drizzle tenant: resolver schema dinâmico | ✅ Concluído — runtime usa `createTenantDatabase(url, schemaName)`; `tenant_template` ficou só no template de migrations |
| **0.9** | `pnpm typecheck` limpo em todo o monorepo | ✅ Concluído — 6/6 pacotes |
| **0.10** | Health check robusto (Postgres + Redis) | ✅ Concluído — `/health/live`, `/health/ready` (PG + Redis, 503 em falha) e `/health/info` |
| **0.11** | UI tenant completa | 🔄 Em andamento — telas de orçamento, despesas e folha existem; falta navegação por módulo contratado |

### Bloco 0.11 — UI tenant (detalhe)

**Já feito:**
- Auth por cookie httpOnly (`sm_admin_*` / `sm_tenant_*`) + CSRF; sem `localStorage`
- Telas de orçamento (LOA, dotações, créditos), despesas (empenhos, pipeline,
  pagamentos) e folha (servidores, holerite)
- Cadastros de pessoas e editor de documentos

**A fazer:**
- [ ] Navegação lateral / menu dirigido pelos módulos contratados do tenant
- [ ] Gestão de usuários do tenant (`/tenant/users`)
- [ ] Telas de cadastro do módulo Folha (cargos, rubricas, vínculos) — B38
- [ ] Ativar `NEXT_PUBLIC_AUTH_MIDDLEWARE_STRICT=true`

---

## Camada 1 — Fundação funcional

- [x] Tenants, Plans, Modules
- [x] Cadastros base (Pessoas PF/PJ, Entidades, Estruturas, Textos Jurídicos, Anexos)
- [x] Auth master + tenant + RBAC
- [x] Provisioning automático de schema

## Camada 2 — Registro

- [x] **Orçamento** (PPA/LOA, dotações, créditos adicionais)
- [x] **Receitas** (naturezas, tipos, lançamentos, arrecadações, anulações)
- [x] **Despesas** (Empenho → Liquidação → Ordem de pagamento → Pagamento)
- [x] **Folha de Pagamento — ciclo mensal** (B33–B35.5: cadastros, engine de
      cálculo, worker BullMQ, rotas REST, progresso via WebSocket)
- [ ] **Folha — suplementares** (B36: 13º, férias, rescisão)
- [ ] **Folha — UI completa** (B38)

## Camada 3 — Inteligência

- [ ] Dashboards gerenciais
- [ ] RREO / RGF (LRF)
- [ ] Índices constitucionais (Saúde 15%, Educação 25%, Pessoal 54%)
- [ ] Portal de Transparência + Audiência Pública

---

## Compliance (transversal)

- **LGPD**: schemas isolados + soft delete + audit logs
- **Lei 14.133/2021**: anexos S3 imutáveis + logs com hash
- **LC 101/2000 (LRF)**: bases para relatórios fiscais na Camada 3
- **TCE/PR (SIM-AM)**: estrutura de entidades e códigos contábeis prevista
