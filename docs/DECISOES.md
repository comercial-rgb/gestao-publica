# Registro de Decisoes Arquiteturais (ADR)

Log cronologico das escolhas estruturais. Toda decisao que afeta multiplos modulos ou cria precedente vai aqui. Para o "como" tecnico, ver [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Convencoes deste documento

- Decisoes sao imutaveis: se revertemos, criamos nova entrada (nao editamos a antiga)
- Status possiveis: **Aceita**, **Revisada**, **Revogada**
- Ordem: cronologica (mais antiga em cima)

---

## ADR-001 -- Multi-tenancy via schema-per-tenant

**Status:** Aceita
**Data:** Inicio do projeto

### Contexto

Sistema fiscal multi-tenant para prefeituras brasileiras. Cada cliente e entidade publica, com dados sob LGPD, auditoria do TCE, e responsabilidade civil. Backup, restore e exclusao de dados precisam ser granulares por cliente.

### Alternativas consideradas

| Opcao | Como funciona | Por que rejeitamos |
|---|---|---|
| **A** | Coluna `tenant_id` em todas tabelas, banco compartilhado | Risco de leak por bug em WHERE; performance degrada com escala; LGPD-delete e complicado |
| **B** | Banco PostgreSQL inteiro por tenant | Custo operacional alto (N bancos = N backups, N pools); over-engineering pra 50-200 tenants |
| **C** | Schema PostgreSQL por tenant *(escolhida)* | Isolamento fisico real; indices e constraints por tenant; backup granular via `pg_dump --schema` |

### Decisao

Schema-per-tenant nomeado `tenant_<slug>` com `slug` validado contra regex `^[a-z0-9-]+$` (antes de qualquer interpolacao SQL).

### Consequencias

- Migrations precisam rodar em N schemas -> criamos `db:migrate:tenants` com tracker `tenant_migrations_applied`
- Pool de conexoes precisa configurar `search_path` por request -> resolvido com `createTenantDatabase(schemaName)` cacheado
- Queries cross-tenant exigem trabalho explicito -> tratado como **feature**, nao bug
- `dropTenantSchema` e trivialmente seguro para LGPD-delete

---

## ADR-002 -- Autenticacao dual: master + tenant

**Status:** Aceita
**Data:** Inicio do projeto

### Contexto

Existem dois tipos de usuario fundamentalmente diferentes:
- Operadores da plataforma SaaS (atendimento, billing, suporte)
- Funcionarios da prefeitura (uso operacional do sistema)

Nao podem compartilhar tabela nem token. Master nao pode ler dados de tenant; tenant nao pode acessar `/admin/*`.

### Decisao

- `public.master_users` separado de `tenant_<slug>.users`
- Cookies separados: `sm_admin_access` (master), `sm_tenant_access` (tenant)
- JWTs com claim `typ: 'master' | 'tenant'` para impedir confusao
- Master so usa `/admin/*`; tenant so usa `/tenant/*`
- Ponte explicita: `POST /admin/tenants/:id/reset-admin` permite master CRIAR usuario no tenant, mas nunca LER dados

### Consequencias

- Duplicacao intencional de fluxo de login (master vs tenant)
- Hierarquia de roles master separada de roles de tenant
- Refresh tokens em `public.refresh_tokens` com discriminator de tipo

---

## ADR-003 -- Senhas com Argon2id (nao bcrypt)

**Status:** Aceita
**Data:** Inicio do projeto

### Contexto

Sistema processa dados de funcionarios publicos. Compromisso de senha = comprometimento de auditor + comprometimento de processo licitatorio. Defesa contra ataque offline precisa ser robusta.

### Decisao

Argon2id com parametros OWASP 2024:
- `memoryCost`: 19456 (19 MiB)
- `timeCost`: 2
- `parallelism`: 1

### Por que nao bcrypt

bcrypt e resistente a GPU mas nao a ASIC. Argon2id (vencedor do PHC, 2015) resiste a ambos.

### Consequencias

- Hash demora ~50ms (vs bcrypt ~10ms) -- aceitavel para login (nao e hot path)
- Biblioteca `argon2` requer build nativo -- adicionado ao Dockerfile

---

## ADR-004 -- Modulos contrataveis com enforcement em runtime

**Status:** Aceita
**Data:** B14

### Contexto

Modelo de negocio e cobrar por capacidade. Plataforma vende planos (Bronze/Prata/Ouro) com conjuntos de modulos. Esconder UI nao e suficiente -- usuario pode adivinhar URL ou usar API diretamente.

### Decisao

- Catalogo `public.modules` lista capacidades vendaveis
- `public.plan_modules` define o conjunto incluido em cada plano
- `public.tenant_modules` instancia capacidades efetivamente ativas por tenant
- Plugin Fastify decora `request.requireActiveModule(slug)` que retorna **402 Payment Required** se modulo nao esta ativo
- Cache em memoria com TTL 60s + invalidacao cross-instance via Redis pub/sub

### Distincao critica: modulo comercial vs funcionalidade transversal

| | Modulo comercial | Funcionalidade transversal |
|---|---|---|
| Em `public.modules`? | Sim | Nao |
| Enforcement runtime? | `requireActiveModule(slug)` | Sem enforcement (faz parte da base) |
| Exemplos | receitas, despesas, folha | calendario fiscal, audit log, RBAC base |

### Consequencias

- Rotas `/tenant/<modulo>/*` exigem `requireActiveModule` no `preHandler`
- Sidebar do tenant filtra por `activeModules` retornado por `/tenant/auth/me`
- Tela admin `/admin/tenants/:id/modulos` permite ativar/desativar individualmente

---

## ADR-005 -- Calendario fiscal obrigatorio antes de Camada 2

**Status:** Aceita
**Data:** B16

### Contexto

Toda operacao fiscal (receita, despesa, pagamento, anulacao) acontece **dentro de um exercicio e dentro de um mes**. Sem esse controle, prefeitura pode lancar receita retroativa apos prestacao de contas.

### Decisao

Antes de implementar Receitas, criar tabelas `exercicios` e `meses_fiscais` no template do tenant. Toda rota que cria lancamento financeiro valida periodo via `assertPeriodoAberto(periodo)`.

Reabertura de mes fechado:
- Contador `reaberturas` incrementado
- Motivo obrigatorio (min 20 chars)
- Permission `fiscal:reabrir_mes` separada de `fiscal:fechar_mes`
- Mes `bloqueado` (pela controladoria) nao pode ser reaberto sem aprovacao

### Consequencias

- Receitas, Despesas, Folha herdam helper `validarDataArrecadacao(data)`
- Provisao de tenant cria automaticamente exercicio do ano corrente + 12 meses
- Backfill via `db:seed:fiscal` para tenants pre-B16

---

## ADR-006 -- Soft delete por padrao

**Status:** Aceita
**Data:** Inicio do projeto

### Contexto

Dados fiscais tem prazo de retencao legal (5-10 anos dependendo do tipo). DELETE fisico em producao quebra historico, auditoria, e em alguns casos viola lei.

### Decisao

- Padrao: coluna `deleted_at TIMESTAMPTZ NULL` em tabelas operacionais
- Queries normais filtram por `deleted_at IS NULL`
- DELETE fisico so em dois casos:
  1. LGPD-delete (titular de dado pessoal exigiu remocao, com base legal)
  2. Limpeza de dados nunca usados em producao (teste, fixtures)

### Consequencias

- Migrations sempre criam `deleted_at` em tabelas que representam entidades duraveis
- Tabelas internas (refresh_tokens, audit_log, historico) NAO usam soft delete -- sao append-only

---

## ADR-007 -- Sem triggers PostgreSQL

**Status:** Aceita
**Data:** Inicio do projeto

### Contexto

Tentacao de usar triggers para coisas como "atualizar saldo da dotacao quando empenho e criado". Parece elegante, mas esconde logica do codigo da aplicacao.

### Decisao

Toda atualizacao de saldo, historico, ou efeito colateral fica explicita no codigo da aplicacao, dentro de transacoes.

### Por que

- **Testabilidade**: logica em TS e testavel; logica em PL/pgSQL exige fixture pesada
- **Debug**: trace de stack mostra exatamente onde valor mudou
- **Migracao**: trigger esquecido em schema novo causa bug silencioso

### Consequencias

- Funcao `aplicarCredito` e ~100 linhas de TS dentro de `db.transaction()` em vez de 1 linha que dispara trigger
- Padrao replicado em todas operacoes fiscais (ver ADR-009)

---

## ADR-008 -- Migrations Drizzle commitadas no git

**Status:** Aceita
**Data:** H15

### Contexto

Padrao inicial seguia "schema TS e fonte da verdade, migrations geradas on-demand". Funcionava para dev, mas:
- Clone limpo exige `db:generate` antes de `db:migrate` -- friccao
- CI quebra sem passo extra de geracao
- Sistema fiscal precisa provar quais migrations rodaram em producao -- auditabilidade

### Decisao

`packages/database/drizzle/` (com migrations SQL e snapshots meta) passa a ser commitado. Schema TS continua sendo a fonte da geracao; migrations geradas sao o **registro imutavel**.

### Regras

- Nao editar migration ja commitada e aplicada -- gerar nova
- Conflitos de merge em migrations: priorizar a mais recente cronologicamente
- Snapshots `meta/*_snapshot.json` tambem commitados (Drizzle precisa deles)

### Consequencias

- Compliance: auditor pode reconstruir schema historico via `git checkout <hash>`
- CI simplificado: `pnpm db:bootstrap:test` funciona sem passo de generate
- PRs ficam maiores quando schema muda (SQL gerado entra no diff) -- trade-off aceito

---

## ADR-009 -- Padrao de operacao fiscal transacional

**Status:** Aceita
**Data:** B25 (aplicar credito orcamentario foi a primeira aplicacao)

### Contexto

Operacoes que mexem em saldos (creditos, empenhos, anulacoes) sao criticas. Falha parcial produz inconsistencia fiscal.

### Decisao

Toda operacao que altera saldos segue 7 passos:

1. **Validar status do agregado** (ex: credito esta 'aprovado'?)
2. **Carregar snapshot** de TODAS as dotacoes/saldos afetados
3. **Simular**: calcular novos saldos sem tocar no banco
4. **Validar todas as simulacoes** antes de qualquer UPDATE
   - Se qualquer uma falhar: retornar 422 com `problemas: [...]`
5. **Abrir transacao** (se tudo OK):
   - Atualizar saldos
   - Inserir entradas de historico
   - Marcar agregado como aplicado
6. **Auditoria FORA da transacao** (best-effort, nao bloqueia)
7. **Retornar resumo**: `{ linhasAfetadas, totalDelta }`

### Confirmacao por digitacao

Operacoes irreversiveis exigem usuario digitar identificador (`confirmNumero`) que bate com o registro.

### Consequencias

- Testes integration cobrem cenario de rollback total
- Padrao replicado em: aplicar credito (B25), aplicar empenho (futuro), liquidar (futuro), pagar (futuro)
- API responde `422` (nao `409`) para impossibilidade fiscal

---

## ADR-010 -- PCASP por estado (nao nacional)

**Status:** Aceita
**Data:** B17

### Contexto

PCASP e federal na origem (STN/MCASP), mas cada Tribunal de Contas estadual adapta.

### Decisao

Tabela `pcasp_versoes (uf, ano, fonte, ativa)` no template do tenant. Cada `receitas_naturezas` referencia uma versao. Seed inicial e PR/2026. Outros estados ganham seed dedicado quando aparece cliente.

### Consequencias

- Tenant de SP tera seed proprio quando contratado
- Naturezas customizadas ficam com `pcasp_versao_id = null`
- Atualizacao de versao cria nova versao sem deletar anterior

---

## ADR-011 -- Versionamento de LOA via creditos + historico de valor

**Status:** Aceita
**Data:** B21 (decisao F3)

### Contexto

LOA e alterada varias vezes durante o ano por creditos suplementares. Auditoria pede: "Qual era valor da dotacao X em julho?".

### Alternativas

| | Trade-off |
|---|---|
| **F1**: Creditos alteram valor_atualizado, sem historico | Simples, sem rastreabilidade |
| **F2**: Snapshot completo da LOA a cada credito | Audit perfeito, dados 12-50x maiores |
| **F3**: F1 + tabela historico por dotacao *(escolhida)* | Balanceado |

### Decisao

- Dotacao tem `valor_inicial` (imutavel) e `valor_atualizado` (mutavel via creditos)
- Tabela `dotacoes_historico_valor` registra cada mudanca
- Populada pela aplicacao na mesma transacao (consistente com ADR-007)

### Consequencias

- Query "valor em julho" = `valor_inicial` + SUM(`delta`) WHERE `registrado_em <= '2026-07-31'`
- Volume baixo (1 entrada por aplicacao de credito, nao 1 por dotacao por dia)

---

## ADR-012 -- Status fiscal de contribuinte em runtime (nao materializado)

**Status:** Aceita (com revisao prevista)
**Data:** B20

### Contexto

Sistema mostra "situacao fiscal" do contribuinte. Calculo e custoso (joins, agregacoes).

### Decisao

Calcular em runtime via CTE PostgreSQL:
- `>= 80%` liquido sobre bruto -> `em_dia`
- `20-80%` -> `parcialmente_em_dia`
- `< 20%` -> `inadimplente`
- 0 arrecadacoes -> `sem_movimento`

### Revisao prevista

Quando primeiro tenant passar de **50.000 contribuintes ativos**, reavaliar. Provavel migracao para materializacao incremental.

---

## ADR-013 -- Importador de LOA via JSON (nao XML direto inicialmente)

**Status:** Aceita (com evolucao prevista)
**Data:** B24

### Contexto

LOA municipal vem do TCE-PR em XML padronizado. Parser XML completo e trabalho consideravel.

### Decisao

MVP aceita **JSON simplificado** que cliente extrai do XML externamente. Backend resolve codigos para IDs e valida.

### Workflow em 2 fases

1. `POST /preview` retorna `{ resolvidas, comErro }` sem criar nada
2. `POST /commit` cria as resolvidas; linhas com erro sao ignoradas mas reportadas

### Evolucao prevista

Quando primeiro cliente trouxer XML real, implementar parser XML -> JSON inline.

---

## ADR-014 -- Testes integration first, sem mocks de DB

**Status:** Aceita
**Data:** TEST1

### Contexto

Sistema tem logica pesada em SQL (CTEs de ranking, transacoes de aplicar credito). Testar com mocks de DB testa o mock, nao a query.

### Decisao

- **Vitest 2** como runner (ESM nativo)
- **`fastify.inject()` nativo** (sem supertest)
- **Container postgres-test dedicado** na porta 5435
- **Tenant descartavel por suite** -- cria + drop schema
- **JWT assinado direto** via helper

### Consequencias

- `pnpm test` exige Docker rodando
- Setup tem guarda anti-banco-de-dev (falha se nao aponta pra 5435)
- Cobertura cresce naturalmente: cada modulo critico ganha 2-3 testes

---

## Decisoes adiadas (nao-decididas, registradas pra futuro)

### CI/CD

Quando primeiro cliente entrar, configurar GitHub Actions: PR -> `typecheck` + `test`; push em `main` -> deploy.

### Staging environment

Sem staging por enquanto. Criar staging com banco anonimizado quando primeiro cliente entrar.

### Materializacao de saldos consolidados

ADR-012 antecipou para contribuintes. Mesma necessidade vai aparecer em saldos por entidade/funcao (relatorios LRF).

### Internacionalizacao (i18n)

Hoje sistema e pt-BR hardcoded. Avaliar `next-intl` quando aparecer projeto internacional.

---

## ADR-016 -- Arquitetura do Motor de Calculo de Folha (B35.2)

**Data:** 2026-05-24
**Status:** Aceito
**Decisores:** Winner (Gerente Geral)

### Contexto

Modulo Folha (B33-B39) precisa de motor de calculo capaz de processar
ate 15.000 servidores/mes com regimes mistos (RGPS + RPPS + estagiarios),
compliance fiscal completo (INSS, IRRF Reforma Lei 15.270/2025, salario-familia,
13o) e auditoria TCE (snapshot imutavel + hash SHA-256).

### Decisoes aplicadas

#### 1. Tabelas em 3 camadas (decisao B34.5 n. 1)
- **Camada 1**: snapshot no holerite (imutavel)
- **Camada 2**: override municipal (`inss_tabelas_custom`, `irrf_tabelas_custom`)
- **Camada 3**: federal oficial (`public.inss_tabelas`, `public.irrf_tabelas`, `public.salario_familia_tabelas`)
- Resolver tenta C2 -> C3 com `vigencia_inicio <= competencia`

#### 2. Regime previdenciario no vinculo (B34.5 n. 2)
- Enum `regime_previdenciario` no `vinculos_funcionais`: `rgps`, `rpps`, `rgps_facultativo`, `isento`
- Tabela `rpps_aliquotas` (tenant) com vigencia + aliquotas linear municipal
- Teto agregado entre vinculos RGPS da mesma pessoa (CF art. 37 XVI c)

#### 3. Proporcionalidade por estrategia (B34.5 n. 3)
- 5 estrategias: `INTEGRAL`, `DIAS_REGISTRADOS`, `DIAS_EFETIVOS_TRABALHADOS`,
  `DIAS_NOTURNOS_DECLARADOS`, `CUSTOMIZADA_SCRIPT`
- Tabela `folha_eventos_funcional` registra admissoes, demissoes, faltas, afastamentos
- `AFASTAMENTO_INSS > 15 dias` limita a 15 (regra fiscal -- apos isso INSS paga)

#### 4. Margem consignavel snapshot (B34.5 n. 4)
- Calculada no fechamento (35% liquido por padrao)
- Snapshot completo no `folha_processamento_log.snapshot`
- Endpoint publico com autorizacao do servidor (B35.4)

#### 5. Salario-familia federal + override RPPS (B34.5 n. 5)
- Tabela federal seedada (2020-2026)
- Campos opcionais em `rpps_aliquotas.salario_familia_valor` / `salario_familia_renda_maxima`
- Engine prefere override RPPS quando regime = `rpps` e campos preenchidos

#### 6. BullMQ desde ja (B34.5 n. 6)
- Simular holerite individual: **sincrono** (preview UX)
- Fechar folha mensal: **assincrono** (BullMQ, concorrencia 1 por tenant)
- 4 jobs definidos: `processarFolhaMensal`, `recalcularHolerite`,
  `gerarEmpenhosFolha`, `enviarEsocialS1200`
- WebSocket de progresso (a implementar em B35.3)

#### 7. eSocial Fase 1 + 2 (B34.5 bonus B2)
- **Fase 1 (B35.1)**: campo `codigo_esocial` em `rubricas` + estrutura preparada
- **Fase 2 (B35.2D)**: gerador de XML S-1200 (RGPS) e S-1202 (RPPS) -- gera arquivo
- **Fase 3 (B40)**: tabelas S-1000, S-1005, S-1010, S-2200 com envio webservice
- **Fase 4 (B41-B42)**: certificado A1, assinatura XMLDSig, retornos assincronos

#### 8. IRRF -- 3 cenarios paralelos da Reforma Lei 15.270/2025 (B34.5 bonus B4)
- Cenario A: progressivo + deducoes legais (INSS, dependentes, pensao)
- Cenario B: A + redutor `max(0, 978.62 - 0.133145 x renda_bruta)` -- so 2026+
- Cenario C: desconto simplificado -- so fev/2024+
- Engine escolhe **menor** (regra Receita Federal -- beneficio do contribuinte)
- Aplicabilidade resolvida via `temDescontoSimplificadoAplicavel` / `temRedutorReforma`
  baseado em `vigenciaInicio` da tabela

#### 9. Snapshot fiscal vs metadata (B35.2D)
- `montarSnapshotFiscal` -- apenas conteudo deterministico, entra no hash
- `montarSnapshotComMetadata` -- fiscal + execution data (gravado no DB)
- Hash idempotente: mesmo input -> mesmo hash (workerId/duracao nao afetam)

### Consequencias

**Positivas:**
- Auditoria TCE completa via snapshot imutavel + hash SHA-256
- Recalculo retroativo correto (resolver por competencia)
- Performance previsivel (engine puro + BullMQ paralelizavel)
- eSocial-ready desde B35 (sem refactor futuro)
- Compliance Reforma do IR 2025 ja no MVP

**Negativas / dividas:**
- Tabelas IRRF pre-2024 usam placeholder em `desconto_simplificado` por
  CHECK constraint (workaround) -- resolver com migration 0004 (B35.3 ou follow-up)
- Engine ainda nao trata teto agregado dentro do `calcularHolerite` --
  cabe ao orquestrador externo (B35.3) chamar `aplicarTetoAgregadoInss`
  apos calcular cada vinculo da mesma pessoa
- Codigos eSocial padronizados sao heuristica -- cliente final pode precisar
  customizar (interface de cadastro vem em B38)

### Alternativas consideradas

- **Tabelas como JSONB unico**: rejeitado -- perde queryability e CHECK constraints
- **Engine sincrono inline (sem BullMQ)**: rejeitado -- folha 15k servidores travaria HTTP
- **eSocial so na Fase 3**: rejeitado -- adicionar `codigo_esocial` depois forca
  refactor de rubricas existentes
- **Decimal.js para precisao**: rejeitado -- overhead desnecessario, `number` cobre
  ate 15 digitos significativos (suficiente pra folha municipal)
