# Handoff — B35.3B (próximo chat)

**Data:** 2026-05-24  
**Branch:** `main` @ `a60ca5c` (synced com `origin/main`)  
**Working tree:** clean

────────────────────────────────────────────────────────────────

## Estado do repositório (checklist final)

```bash
git status                 # clean
git log origin/main..HEAD  # vazio
```

**Commits desta sessão (folha + worker):**

| Commit    | Descrição |
|-----------|-----------|
| `396d637` | feat(folha-engine): salario-familia + 13o + orquestrador |
| `3cbb3a2` | feat(folha-engine): snapshot fiscal idempotente + eSocial + ADR-016 |
| `7967a05` | chore(database): exports + RegimePrevidenciario + relax Db |
| `a60ca5c` | feat(worker): apps/worker BullMQ + job processarFolhaMensal |

────────────────────────────────────────────────────────────────

## O que já está pronto

### packages/folha-engine (B35.2 completo)

- **Calculadoras:** proporcionalidade, INSS, IRRF, salário-família, 13º
- **Resolvers:** INSS/IRRF/SF (3 camadas), RPPS
- **Engine:** `calcularHolerite`, `montarContextoCalculo`, snapshot fiscal idempotente + hash SHA-256
- **eSocial:** `codigos-s1010`, `categoria`, `buildEventoRemuneracao` (S-1200/S-1202)
- **Testes:** 81 verdes (`pnpm -C packages/folha-engine test`)
- **Docs:** ADR-016 em `docs/DECISOES.md`, `docs/MODULOS/folha.md`

### packages/database

- Migration tenant **0007** (RPPS, dependentes, eventos, consignações, progresso, log)
- Migration public **0003** (tabelas federais INSS/IRRF/SF)
- Seeds 2020–2026: `pnpm -C packages/database db:seed:folha:publico`
- Exports no `package.json` para `schema/folha-*`, `seeds/folha-publico`, `utils/hash-snapshot`

### apps/worker (B35.3A)

- BullMQ queue **`folha`** — 4 tipos declarados, 1 implementado
- **`processarFolhaMensal`:** lock Redis SETNX, batch 200, preload 4 queries, `Promise.all`, grava `folha_processamento_log` + holerites + lançamentos
- **ProgressoTracker:** `folha_progresso` + pub/sub `folha:progresso:{folhaId}`
- **TenantPool:** cache PG por tenant, cleanup 5 min idle
- **Testes:** 3 smoke (`pnpm -C apps/worker test`)
- **Boot:** `pnpm -C apps/worker dev` → `Worker pronto -- aguardando jobs na queue "folha"`

────────────────────────────────────────────────────────────────

## Infra dev (gotchas)

| Serviço | Porta | Credenciais |
|---------|-------|-------------|
| Postgres dev | 5434 | `saas:saas@localhost:5434/saas_municipal` |
| Postgres test | 5435 | idem (container `postgres-test`) |
| Redis | 6380 | `redis://localhost:6380` |
| API | 3333 | — |
| Web | 3000 | — |

- Tenant principal: **santa-izabel-oeste** (`tenant_santa_izabel_oeste`)
- Login dev: `admin@prefeitura.local`
- Drizzle: **não** usar `pgSchema('public')` — usar `pgTable()`
- JSX web: evitar `-->` e `->` em strings (usar `→`)
- H16: nunca `::text` em UPDATE de colunas numeric

────────────────────────────────────────────────────────────────

## B35.3B — escopo do próximo chat

### 1. Jobs restantes (apps/worker)

| Job | Status | Arquivo sugerido |
|-----|--------|------------------|
| `RECALCULAR_HOLERITE` | stub | `src/jobs/recalcular-holerite.ts` |
| `GERAR_EMPENHOS_FOLHA` | stub | `src/jobs/gerar-empenhos-folha.ts` |
| `ENVIAR_ESOCIAL_S1200` | stub | `src/jobs/enviar-esocial-s1200.ts` |

Registrar no switch de `src/index.ts`.

### 2. WebSocket gateway (apps/api)

- Assinar Redis pub/sub canal `folha:progresso:{folhaId}`
- Repassar updates pro cliente (Fastify WebSocket ou `@fastify/websocket`)
- Endpoint sugerido: `WS /folhas/:id/progresso`

### 3. Testes E2E

- Usar fixtures existentes (`apps/api/test/fixtures.ts` → `seedFolhaCalculoCompleto`)
- Tenant descartável + vínculos reais + rubricas em `rubricas_vinculos`
- Validar holerite calculado + hash determinístico + progresso no DB

### 4. Tech debt anotado

- IRRF pré-2024: placeholder em `desconto_simplificado` (CHECK > 0) — migration 0004
- Teto agregado INSS: orquestrador externo deve chamar `aplicarTetoAgregadoInss` após calcular todos vínculos da mesma pessoa
- `docs/MODULOS/folha.md` status ainda diz "Aguardando B35.3" — atualizar após 3B

────────────────────────────────────────────────────────────────

## Comandos úteis

```bash
# Validação rápida
pnpm typecheck                              # 6/6 packages
pnpm -C packages/folha-engine test          # 81
pnpm -C apps/worker test                    # 3 smoke
redis-cli -p 6380 ping

# Worker
pnpm -C apps/worker dev

# Seeds folha
pnpm -C packages/database db:seed:folha:publico
pnpm db:migrate:tenants
```

────────────────────────────────────────────────────────────────

## Sequência sugerida B35.3B

```bash
# 1. Implementar jobs restantes + registrar no index.ts
# 2. WebSocket gateway no apps/api
# 3. Testes E2E (worker + api)
# 4. pnpm typecheck && pnpm test
# 5. Atualizar docs/MODULOS/folha.md (status B35.3)
# 6. git commit + push
```

**Depois de B35.3:** B35.4 (API routes fechar folha + simular holerite).
