# Arquitetura

Este documento descreve as decisoes estruturais do SaaS Municipal. Para o historico cronologico das decisoes e seus trade-offs, ver [`DECISOES.md`](./DECISOES.md). Para detalhes de modulos especificos, ver [`MODULOS/`](./MODULOS/).

## Principios

O sistema foi projetado a partir de cinco principios nao-negociaveis:

1. **Isolamento fisico de dados entre municipios.** Cada tenant e um cliente publico (prefeitura), sujeito a LGPD, auditoria do TCE, e responsabilidade civil. Vazamento cruzado de dados nao e "bug" -- e incidente juridico. Isolamento se da em nivel de schema PostgreSQL, nao de coluna `tenant_id`.

2. **Auditabilidade total.** Toda mutacao relevante grava registro em `audit_log` (master) ou `tenant_audit_log` (tenant). Historico de alteracoes em valores fiscais (dotacoes, anulacoes, etc) e granular. Soft delete e o padrao; DELETE fisico so por LGPD.

3. **Conformidade primeiro.** Schema reflete normas: Lei 4.320/64, LRF, MCASP, PCASP-PR, padroes STN. Quando regra fiscal e DX (developer experience) conflitam, regra fiscal ganha.

4. **Modulos contrataveis.** Plataforma cobra por capacidade ativada. Enforcement em runtime -- nao basta esconder UI; rota da API recusa com 402 se modulo nao esta ativo no tenant.

5. **Operacoes fiscais sao transacionais.** Empenho, liquidacao, pagamento, aplicacao de credito, anulacao de arrecadacao -- toda operacao que mexe em saldo e atomica. Falha parcial e proibida.

## Visao sistemica

```
+----------------------------------------------------------------+
|                          Cliente (browser)                      |
|   Next.js 15 SPA       +---> /admin  (master operators)        |
|                         +---> /tenant (tenant users)            |
+--------------------+-------------------------------------------+
                     |
                     | HTTPS + cookies httpOnly (sm_tenant_access,
                     | sm_admin_access, sm_csrf)
                     v
+----------------------------------------------------------------+
|                    Next.js server (Vercel)                      |
|   Proxy /api/proxy/* --> http://api:3333                       |
|   - Reescreve cookies                                          |
|   - Adiciona X-Tenant-Slug quando aplicavel                    |
+--------------------+-------------------------------------------+
                     |
                     v
+----------------------------------------------------------------+
|              Fastify API (Node 20, AWS sa-east-1)              |
|   +----------------------------------------------------------+ |
|   |  Plugins (ordem):                                        | |
|   |   helmet -> cors -> cookie -> rate-limit(Redis) ->       | |
|   |   sensible -> auth -> redis -> modules -> csrf ->        | |
|   |   swagger                                                | |
|   +----------------------------------------------------------+ |
|                                                                |
|   Rotas:                                                       |
|   /admin/*           operacao master (authenticateMaster)      |
|   /tenant/*          operacao tenant (authenticateTenant +     |
|                      requireActiveModule)                      |
|   /health/{live,ready,info}                                    |
|   /docs              Swagger (apenas dev)                      |
+----------+---------------------------------+-------------------+
           |                                 |
           v                                 v
+--------------------------+    +--------------------------------+
|  PostgreSQL 16            |    |  Redis 7                       |
|  ------------------------ |    |  ------------------------------ |
|  public schema:           |    |  rate-limit counters (sm:rl:)  |
|   tenants, plans, modules |    |  module-cache invalidation     |
|   master_users, ...       |    |   pub/sub                      |
|                           |    |                                |
|  tenant_<slug> schemas:   |    +--------------------------------+
|   users, roles,           |
|   pessoas, entidades,     |
|   exercicios,             |
|   receitas_*, dotacoes,   |
|   creditos_*, ...         |
+--------------------------+
```

## Multi-tenancy

### Modelo escolhido: schema-per-tenant

Cada tenant e um schema PostgreSQL nomeado `tenant_<slug>` (ex: `tenant_santa_izabel_oeste`). Nao ha coluna `tenant_id` espalhada pelas tabelas operacionais.

**Vantagens:**
- Isolamento fisico (auditor pode pedir backup so do tenant X)
- Performance: indices sao por tenant, nao competem
- Backup/restore granular
- LGPD: drop schema = exclusao completa do municipio
- Constraints (UNIQUE, FK) sao por tenant naturalmente

**Trade-offs aceitos:**
- Migrations precisam rodar em N schemas (gerenciado por `db:migrate:tenants`)
- Pool de conexoes precisa fazer `SET search_path` por request
- Nao da pra fazer query cross-tenant trivialmente (mas isso e feature, nao bug)

### Resolucao de tenant em runtime

Toda request `/tenant/*` resolve o tenant assim:

1. **Header `X-Tenant-Slug`** (set pelo proxy Next.js a partir da URL ou contexto)
2. Senao, **claim `slug` do JWT**
3. Senao, **erro 401**

A funcao `req.resolveTenant()` retorna `{ id, slug, schemaName, ... }` validado contra `public.tenants`.

### Conexao por tenant

`createTenantDatabase(connectionString, schemaName)` retorna instancia Drizzle com `search_path` configurado para o schema. Cache de pools por schema evita reconectar a cada request.

**Atencao**: nunca interpolar `schemaName` em SQL sem `validateSchemaName()`. SQL injection via slug malicioso e prevenido so por essa validacao -- confiar nela.

## Autenticacao e autorizacao

### Dois dominios de identidade

| Dominio | Usuarios | Onde vive | Token |
|---|---|---|---|
| **Master** | Operadores do SaaS | `public.master_users` | `sm_admin_access` |
| **Tenant** | Funcionarios do municipio | `tenant_<slug>.users` | `sm_tenant_access` |

Nenhum master tem acesso a dados de tenant via API tenant. Master so usa `/admin/*`. Tenants so usam `/tenant/*`. Cruzamento e controlado: master pode `POST /admin/tenants/:id/reset-admin` (cria/reseta usuario no tenant), mas nunca le dados do tenant.

### Cadeia de auth

1. **Password**: Argon2id (OWASP 2024: memoryCost 19456, timeCost 2, parallelism 1)
2. **Access token**: JWT HS256 com TTL configuravel, cookie httpOnly + Secure + SameSite=Strict
3. **Refresh token**: rotacionado a cada uso, hash armazenado em `public.refresh_tokens`
4. **CSRF**: token separado (`sm_csrf`, nao-httpOnly), exigido em todo metodo mutativo via header `X-CSRF-Token`

### RBAC

Tres niveis de granularidade:

```
Role  ->  Permission  ->  Action
admin_municipal  ->  receitas:arrecadar  ->  POST /tenant/receitas/arrecadacoes
```

Roles padrao por tenant (vem do `reseedTenantBaseline`):
- `admin_municipal` -- todas as permissions
- `gestor_financeiro` -- receitas + orcamento + fiscal limitado
- `contabilista` -- receitas + relatorios + audit:read
- `rh` -- cadastros + dashboard (folha quando criada)
- `auditoria` -- todas as `*:read`
- `operador` -- cadastros + receitas:arrecadar

## Modulos: comerciais vs transversais

### Modulos comerciais (catalogo `public.modules`)

Sao contrataveis. Plano vincula um conjunto via `public.plan_modules`. Tenant tem instancia via `public.tenant_modules`. Acesso checado em runtime por `requireActiveModule(slug)`.

| Slug | Categoria | Plano que inclui |
|---|---|---|
| `cadastros` | fundacao | Bronze, Prata, Ouro |
| `textos_juridicos` | fundacao | Bronze, Prata, Ouro |
| `usuarios` | fundacao | Bronze, Prata, Ouro |
| `receitas` | registro | Prata, Ouro |
| `despesas` | registro | Prata, Ouro |
| `folha` | registro | Prata, Ouro |
| `orcamento` | registro | Ouro |
| `analise_gerencial` | inteligencia | Ouro |
| `demonstrativos` | inteligencia | Ouro |
| `indices` | inteligencia | Ouro |
| `verificacoes` | inteligencia | Ouro |
| `audiencia_publica` | inteligencia | Ouro |

### Funcionalidades transversais (parte do `tenancy.baseline`)

Vem com qualquer tenant ativo. Nao sao contrataveis separadamente. Nao aparecem no catalogo `public.modules`.

| Funcionalidade | Onde vive |
|---|---|
| Calendario fiscal (exercicios + meses) | `reseedTenantBaseline()` cria estrutura |
| Permissions e roles base | `reseedTenantBaseline()` cria roles |
| Audit log de tenant | tabela criada na migration 0000 |
| Health checks da app | rotas globais `/health/*` |

Na UI, esses itens aparecem na sidebar com `module: null`, sempre visiveis para usuarios autenticados.

## Enforcement de modulos

```
Request                       Plugin de modules                     Cache
|                                  |                                |
+- POST /tenant/receitas/...      |                                |
|                                  |                                |
+- authenticate -----------------> |                                |
|   (sm_tenant_access JWT valido) |                                |
|                                  |                                |
+- resolveTenant ----------------> |                                |
|   (tenant.id no contexto)       |                                |
|                                  |                                |
+- requireActiveModule('receitas')|                                |
|                                  +- getTenantActiveModules ----> +- Hit? <60s
|                                  |                                |      |
|                                  |                                |   retorna Set
|                                  |                                |
|                                  +- contains('receitas')?         |
|                                  |   +- sim -> next()             |
|                                  |   +- nao -> throw 402          |
|                                  |                                |
+- handler executa                                                  |
```

Invalidacao:
- Master ativa/desativa modulo -> `publishInvalidation(app, tenantId)` -> Redis PUBLISH -> todos os pods dropam cache local

Cache local com TTL de 60s + Redis pub/sub para invalidacao cross-instance. Sem Redis (single-instance), o sistema degrada gracefully -- so nao ha sync entre pods.

## Calendario fiscal

Todo lancamento financeiro (receita, despesa, pagamento, anulacao) referencia um **exercicio** (ano) e um **mes fiscal**. Exercicios e meses tem status que controla o que pode ser feito:

```
Exercicio:  aberto -> em_encerramento -> encerrado
Mes fiscal: aberto -> fechado -> (reabrir) -> aberto
                         +-> bloqueado (controladoria)
```

**Regras enforced em codigo**:
- Nao cria lancamento em mes `fechado` ou `bloqueado` (helper `assertPeriodoAberto`)
- Nao encerra exercicio se ha meses nao-`fechado`
- Toda reabertura incrementa contador `reaberturas` e exige motivo (min 20 chars)

## Padrao de operacao fiscal transacional

A operacao **aplicar credito orcamentario** (`POST /tenant/orcamento/creditos/:id/aplicar`) e referencia. Toda futura operacao que mexer em saldos (empenho, liquidacao, etc) deve seguir o mesmo padrao:

```
1. Validar status do agregado (ex: credito esta 'aprovado'?)
2. Carregar snapshot de TODAS as dotacoes/saldos afetados
3. Simular: para cada linha, calcular novo saldo
4. Validar TODAS as simulacoes antes de tocar no banco
   Se qualquer uma falhar: retornar 422 com problemas: [...]
5. Se tudo OK: abrir TRANSACAO
   - Atualizar saldos
   - Inserir entradas de historico
   - Marcar agregado como aplicado
6. Auditoria FORA da transacao (best-effort)
7. Retornar resumo: { linhasAfetadas, totalDelta }
```

**Anti-padroes evitados**:
- Triggers em PostgreSQL (escondem logica, dificultam testar)
- Saldos calculados via SUM em runtime (lento com volume real)
- Validacao por linha durante atualizacao (deixa estado parcial)

## Estrutura de testes

```
apps/api/test/
+-- setup.ts                    bootstrap de ambiente
+-- helpers/
|   +-- auth.ts                 signTestTenantToken, buildTenantCookieHeader
|   +-- db.ts                   provisionTestTenant (com dispose)
+-- fixtures.ts                 factory functions
+-- integration/
    +-- orcamento/
        +-- creditos.aplicar.test.ts    3 cenarios
```

Estrategia:
- **Integration first**: testa rota Fastify real contra Postgres real
- **fastify.inject()**: sem subir servidor
- **Tenant descartavel por suite**: cria + drop schema entre runs
- **JWT direto**: helper assina token, evita fluxo de login
- **Banco isolado** em porta 5435 com guarda no setup.ts (NODE_ENV=test obrigatorio)

## Dados sensiveis e segredos

| Tipo | Onde |
|---|---|
| Senha de usuario | hash Argon2id em `users.password_hash` (nunca exposto na API) |
| Refresh token | hash SHA256 em `refresh_tokens.token_hash` |
| AUTH_SECRET | `.env`, nunca em codigo nem em logs |
| CNPJ/CPF de pessoas | tenant schema, criptografia at-rest do RDS |
| Audit log | inclui IP, mas nao inclui body completo de requests |

## Deploy

Producao (planejada):
- **AWS sa-east-1**: RDS Postgres 16 (Multi-AZ), ElastiCache Redis, ECS Fargate para API
- **Vercel**: Next.js frontend
- **Cloudflare**: WAF + cache estatico

CI/CD (planejada via GitHub Actions):
- Pull request -> `pnpm typecheck && pnpm test`
- Push em `main` -> deploy automatico
- Migrations rodam via job dedicado, separado do deploy da app

## Glossario rapido

| Termo | Significado |
|---|---|
| **Tenant** | Cliente do SaaS (municipio) |
| **Master** | Operadores internos da plataforma |
| **PCASP** | Plano de Contas Aplicado ao Setor Publico (STN/MCASP) |
| **PPA** | Plano Plurianual (lei orcamentaria, 4 anos) |
| **LOA** | Lei Orcamentaria Anual |
| **Dotacao** | Autorizacao especifica de gasto na LOA |
| **Empenho** | Reserva de saldo de dotacao para uma despesa |
| **Liquidacao** | Confirmacao de que servico/produto foi entregue |
| **Pagamento** | Emissao de OP (Ordem de Pagamento) e quitacao |
| **SICONFI** | Sistema federal que recebe MSC do municipio |
| **MSC** | Matriz de Saldos Contabeis (formato SICONFI) |
| **TCE-PR** | Tribunal de Contas do Parana |
| **LRF** | Lei de Responsabilidade Fiscal (LC 101/2000) |

## Onde ir a seguir

- Decisoes arquiteturais com justificativa: [`DECISOES.md`](./DECISOES.md)
- Detalhes do modulo Orcamento: [`MODULOS/orcamento.md`](./MODULOS/orcamento.md)
- Setup local: [README](../README.md)
