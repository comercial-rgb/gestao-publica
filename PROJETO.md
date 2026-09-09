# SIAFIC — Prefeitura de Campina Grande/PB

Sistema de contabilidade pública em conformidade com o SIAFIC (Decreto Federal
10.540/2020): Sistema Único e Integrado de Execução Orçamentária, Administração
Financeira e Controle. Monorepo modular — cada módulo de negócio é uma pasta
fechada com seu próprio manifesto `MODULO.md`.

## Stack (FIXO — não trocar)

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (strict mode) |
| ORM / Banco | Prisma 7 + PostgreSQL (schema multi-arquivo em `prisma/schema/`) |
| Validação | Zod |
| Testes | Vitest |
| Arquitetura | Hexagonal: domain puro sem I/O; ports = interfaces; adapters na borda |
| Dinheiro | `decimal.js` no domínio / `Prisma.Decimal` na persistência |

## REGRA DE OURO DO DECIMAL

**DINHEIRO NUNCA É FLOAT/NUMBER.**

- No schema Prisma: `Decimal @db.Decimal(18, 2)` para valores monetários.
- Alíquotas/índices: `Decimal @db.Decimal(9, 6)`.
- No código: `Decimal` (decimal.js) ou `Prisma.Decimal`. **Proibido** usar
  `+`, `-`, `*`, `/` nativos de `number` em valor monetário — use os métodos
  da lib (`plus`, `minus`, `times`, `div`) via helpers de
  `packages/contracts/money.ts`.

## Invariantes não-negociáveis

1. **Decimal sempre** (regra de ouro acima).
2. **Ledger append-only.** Lançamento contábil é imutável: nunca UPDATE, nunca
   DELETE. Correção/estorno = SEMPRE um novo lançamento que referencia o
   original via `estornoDeId` — campo imutável, setado na criação.
   **Não existe `estornadoPorId`**: marcar o original exigiria um UPDATE nele,
   que é justamente o que este invariante proíbe. "Está estornado?" é DERIVADO
   da relação inversa (`estornos.length > 0`).
3. **Idempotência** em toda entrada externa, garantida por unique constraint
   no banco (`@@unique([fonte, chaveIdemp])` no inbox,
   `@@unique([destino, chaveIdemp])` no outbox).
4. **Fail-closed.** Na dúvida, rejeite. Lançamento desbalanceado = erro,
   nunca grava.

## Convenção de trabalho com IA

**1 sessão = 1 módulo.** Ao trabalhar em um módulo, leia SOMENTE:

1. Este `PROJETO.md` (visão macro + invariantes), e
2. O `MODULO.md` do módulo alvo (use `MODULO.template.md` como base ao criar).

Não leia nem altere outros módulos. Os alicerces compartilhados são
`packages/contracts/` (tipos + Zod), `packages/ledger/` (motor de partidas
dobradas, domain puro) e `prisma/schema/_base.prisma` (enums globais,
inbox/outbox de integração).

## Módulos (M01–M19)

Numeração **definitiva**, alinhada à ordem de dependência real.

| Módulo | Nome | Status |
| --- | --- | --- |
| M01 | core-contábil | concluído |
| M02 | planejamento | estrutura + seed concluídos; PPA/LDO/LOA e limites pendentes |
| M03 | créditos adicionais | concluído |
| M04 | receita | concluído |
| M05 | despesa: reserva → empenho → liquidação → pagamento | concluído |
| M06 | ordem cronológica de pagamento | concluído |
| M07 | extraorçamentário (consignações, retenções, cauções) | concluído |
| M08 | restos a pagar + exercício | concluído |
| M09 | financeiro / tesouraria | pendente |
| M10 | patrimonial | pendente |
| M11 | licitações / contratos | pendente |
| M12 | relatórios | pendente |
| M13 | transparência | pendente |
| M14 | exports federais | pendente |
| M15 | retenções / motor fiscal | pendente |
| M16 | segurança / auditoria | pendente |
| M17 | integrações | pendente |
| M18 | IA | pendente |
| M19 | pessoas e credores (cadastro append-only, papéis, histórico) | concluído — ENT01 |

> **Numeração revisada na Parte 3:** o scaffold original tinha receita/despesa
> fora da ordem de dependência. Módulos com código (M01/M02/M04) mantêm número;
> a renumeração afetou só rótulos de módulos ainda não construídos.

## Estrutura do repositório

```
PROJETO.md              ← este arquivo (visão macro)
MODULO.template.md      ← template para o MODULO.md de cada módulo
prisma.config.ts        ← config Prisma 7 (schema multi-arquivo)
prisma/schema/          ← *.prisma (base + 1 arquivo por módulo)
packages/contracts/     ← tipos compartilhados + Zod (money, periodo)
packages/ledger/        ← motor de partidas dobradas (domain puro, zero I/O)
modules/                ← M01–M18, uma pasta fechada por módulo
```

## Modelo do ledger: PERNA ÚNICA

Cada partida toca UMA conta, com `tipo` = `DEBITO` ou `CREDITO`. Um lançamento
é um conjunto de pernas. Consequências:

- `ΣDÉBITO == ΣCRÉDITO` é um invariante REAL a validar (num formato
  débito/crédito por linha ele seria estrutural e o check não pegaria nada).
- O balanceamento vale também DENTRO de cada subsistema — no MCASP,
  orçamentário, patrimonial e controle fecham cada um sozinho.
- `packages/ledger` valida as pernas sem tocar em banco. As regras que
  precisam de banco — "a conta existe e é analítica", "este lançamento já foi
  estornado" — vivem no M01, que tem as ports. Hexagonal preservado.

### ⚠️ UM LANÇAMENTO PODE TER PERNAS DE VALORES DIFERENTES

**Correção transversal (M01/M05/M08), levantada pelo M07.** Enquanto todo
lançamento do sistema teve pernas de valor **igual**, dava para tratá-lo como
`(valor, roteiro)` — um valor, aplicado a todas as pernas. **Isso deixou de valer
com a retenção na fonte:** o pagamento com retenção é um lançamento **composto** —
o caixa leva o **líquido**, as demais pernas o **bruto**, e cada consignação tem a
sua perna.

A regra, agora explícita:

> **`gerarEstorno` produz o valor de CADA perna. Quem persiste NÃO pode recarimbar
> um valor único por cima.**

Dois estornos do M08 faziam exatamente isso (`resolverPartidas`, corrigido). Era
**invisível** — as pernas continuavam batendo entre si, o balanço fechava — mas num
lançamento composto o estorno **devolveria ao caixa o BRUTO de um pagamento que só
desembolsou o LÍQUIDO**. Regressão clássica: a condição que a esconde ("todas as
pernas têm o mesmo valor") é a que **todo teste antigo satisfaz**. Trancada pelo
teste *"estorno de lançamento com pernas DESIGUAIS"* (`m08-anulacao-rp.test.ts`) —
o único do M08 com pernas desiguais.

**Ao escrever um adapter novo:** resolva as contas das partidas **já compostas**,
preservando `p.valor`. Só use `(valor, roteiro)` quando você mesmo estiver compondo
um lançamento de pernas uniformes.

## Banco de desenvolvimento

```bash
# Postgres descartável (credenciais batem com o DATABASE_URL do .env.example)
docker run --name pg-siafic -e POSTGRES_USER=siafic -e POSTGRES_PASSWORD=siafic \
  -e POSTGRES_DB=siafic_cg -p 5432:5432 -d postgres:18

npx prisma migrate dev   # aplica as migrations versionadas

# SQL fora do alcance do Prisma (índices parciais etc.) — passo separado,
# OBRIGATÓRIO em todo ambiente novo. Ver prisma/sql/.
docker exec -i pg-siafic psql -U siafic -d siafic_cg < prisma/sql/uq_estorno_unico.sql
```

## Banco de TESTE isolado (obrigatório)

**A suíte de integração usa `DATABASE_URL_TEST`, nunca `DATABASE_URL`.**
**NUNCA aponte o `DATABASE_URL` de dev/prod para a suíte — ela TRUNCA as tabelas
de domínio** (plano de contas, plano de classificação, ledger) no `beforeEach`.

Isso não é convenção, é imposto por código: `test/db-teste.ts` ABORTA a suíte se
`DATABASE_URL_TEST` faltar ou apontar para o mesmo host+porta+database+schema que
`DATABASE_URL`. O `globalSetup` cria o database de teste, aplica as migrations e
o SQL de `prisma/sql/`; o `setupFiles` reescreve `process.env.DATABASE_URL` para
o banco de teste em cada worker — a suíte fisicamente não alcança o dev.

```bash
# no .env
DATABASE_URL_TEST="postgresql://siafic:siafic@localhost:5432/siafic_cg_test?schema=public"
```

## Comandos

```bash
npx prisma validate   # valida o schema multi-arquivo
npx prisma generate   # gera o client em prisma/generated/client
npx vitest run        # todos os testes (integração roda no banco de TESTE)
npx tsc --noEmit      # typecheck
npm run seed:m02      # seed oficial STN no banco de DEV
```

## Armadilhas do Prisma 7 (custaram tempo — não repetir)

- **O `PrismaClient` exige um driver adapter.** O query compiler está ligado (sem
  engine Rust): `datasourceUrl`/`datasources` **não existem** mais no construtor.
  Instancie via `@prisma/adapter-pg` — no M01, `criarPrismaClient(url)`.
- **`prisma/migrations/` só aceita migrations.** Qualquer subpasta ali precisa de
  um `migration.sql`; um `.sql` avulso quebra o `migrate` com `P3015`. SQL manual
  vive em `prisma/sql/`.
- **Índices parciais não geram drift.** O Prisma não os representa e os ignora no
  diff — a garantia dura no banco convive com o schema sem conflito.
