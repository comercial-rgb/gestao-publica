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

### → Bloco 0.7 — Cookies httpOnly

O middleware (H7) já está pronto e aguardando cookies. Falta apenas:

1. **API** — setar cookies `httpOnly` nos endpoints de login/refresh/logout:
   - `sm_admin_access` / `sm_admin_refresh` (master)
   - `sm_tenant_access` / `sm_tenant_refresh` (tenant)
2. **Web** — remover `localStorage` dos tokens em `/login` e `/admin/login`
3. **Ativar modo estrito** — `NEXT_PUBLIC_AUTH_MIDDLEWARE_STRICT=true` no `.env`

Com isso, o middleware passa a proteger `/admin/*` e `/tenant/*` sem depender de tokens no browser.

---

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
| **0.7** | Cookies httpOnly (substituir localStorage) | 🔄 **Próximo** — middleware pronto (H7); falta setar cookies na API |
| **0.8** | Drizzle tenant: resolver schema dinâmico (eliminar hardcode `tenant_template` nas queries) | ⏳ Pendente |
| **0.9** | `pnpm typecheck` limpo em todo o monorepo | ⏳ Pendente |
| **0.10** | Health check robusto (Postgres + Redis) | 🔄 Parcial — Redis conectado (H5); falta `app.redis.ping()` e check do Postgres em `/health` |
| **0.11** | UI tenant completa | 🔄 Esqueleto criado (H1) — ver abaixo |

### Bloco 0.7 — Cookies httpOnly (detalhe)

**Já feito (H7):**
- `apps/web/middleware.ts` com rotas protegidas e modo permissivo (`NEXT_PUBLIC_AUTH_MIDDLEWARE_STRICT=false` por default)
- Cookies esperados: `sm_admin_access`, `sm_tenant_access`
- Redirect automático para `/admin/login` ou `/login` quando strict=true e cookie ausente

**A fazer:**
- [ ] `Set-Cookie` httpOnly nos handlers de auth (master + tenant)
- [ ] Refresh token também em cookie httpOnly (separado do access)
- [ ] Logout limpa cookies
- [ ] Remover `localStorage` das páginas de login
- [ ] Documentar flag no `.env.example` (já presente)
- [ ] Ativar `NEXT_PUBLIC_AUTH_MIDDLEWARE_STRICT=true` após migração

### Bloco 0.10 — Health check robusto (detalhe)

**Já feito (H5):**
- Plugin Redis registrado (`apps/api/src/plugins/redis.ts`)
- Rate-limit usa store Redis quando `REDIS_URL` está definido
- Log de conexão na subida da API

**A fazer:**
- [ ] Expandir `GET /health` para verificar dependências:
  ```ts
  // Exemplo
  await app.redis?.ping()          // Redis
  await masterDb.execute(sql`SELECT 1`)  // Postgres
  ```
- [ ] Retornar `503` com detalhes se alguma dependência falhar
- [ ] (Opcional) endpoint `/health/ready` vs `/health/live` para Kubernetes

### Bloco 0.11 — UI tenant completa (detalhe)

**Já feito (H1):**
- Redirect pós-login: `/login` → `/tenant/dashboard`
- Esqueleto mínimo criado:
  - `apps/web/app/tenant/layout.tsx` — header com nome da prefeitura + botão Sair (localStorage por enquanto)
  - `apps/web/app/tenant/dashboard/page.tsx` — boas-vindas, roles/permissions, grid de módulos “Em breve”

**A fazer:**
- [ ] Migrar auth para cookies (depende do Bloco 0.7)
- [ ] Telas de cadastros: Pessoas, Entidades, Textos Jurídicos
- [ ] Gestão de usuários do tenant (`/tenant/users`)
- [ ] Navegação lateral / menu por módulo contratado
- [ ] Corrigir queries Drizzle no schema dinâmico (depende do Bloco 0.8)

---

## Camada 1 — Fundação funcional

- [x] Tenants, Plans, Modules
- [x] Cadastros base (Pessoas PF/PJ, Entidades, Estruturas, Textos Jurídicos, Anexos)
- [x] Auth master + tenant + RBAC
- [x] Provisioning automático de schema

## Camada 2 — Registro (próximo)

- [ ] **Receitas** (tributos, lançamentos, recebimentos)
- [ ] **Despesas** (Empenho → Liquidação → Pagamento)
- [ ] **Folha de Pagamento** (servidores, eventos, cálculo, geração de empenhos)

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
