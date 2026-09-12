# Arquitetura técnica do gestao-publica

As decisões de stack e de desenho do núcleo, e as armadilhas que já custaram tempo.
As REGRAS do repositório estão no `CLAUDE.md`, na raiz; este arquivo é o detalhe
técnico que elas pressupõem.

O núcleo nasceu como SIAFIC (Decreto Federal 10.540/2020) para a POC de Campina
Grande/PB, e é por isso que o vocabulário do M01 ao M14 é o daquele decreto.
**O produto não é esse recorte:** SIAFIC é um conjunto de módulos daqui, e o
sistema é de gestão pública municipal inteira. Cada módulo de negócio é uma pasta
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

## Convenção de trabalho

⚠️ **ESTA SEÇÃO DIZIA "1 sessão = 1 módulo, não leia nem altere outros módulos", e a
regra caiu por medição.** Um lote de superfície liga o cadastro novo aos anexos do
M22, aos campos adicionais do M25, ao protocolo do M21 e ao designer do M26 — e a
instrução de não ler outro módulo levaria a reconstruir o que já existe, que é o
defeito mais caro deste repositório.

O que vale:

1. `CLAUDE.md` — as regras e os invariantes;
2. `ESTADO-EXECUCAO.md` — onde paramos;
3. o `MODULO.md` de **todo** módulo que o lote toca, alvo e ligado (use
   `MODULO.template.md` como base ao criar um);
4. este arquivo, para o desenho do núcleo.

**Ler é livre; ALTERAR é que fica no escopo declarado do lote.** Os alicerces
compartilhados são
`packages/contracts/` (tipos + Zod), `packages/ledger/` (motor de partidas
dobradas, domain puro) e `prisma/schema/_base.prisma` (enums globais,
inbox/outbox de integração).

## Módulos

⚠️ **A TABELA DE STATUS QUE HAVIA AQUI FOI REMOVIDA, E A REMOÇÃO É A LIÇÃO.** Ela
listava M09 a M14 como "pendentes" quando os seis já tinham código e testes; não
conhecia os módulos M20 a M31; e nomeava M15, M17 e M18 que não existem como pasta.
Um leitor que confiasse nela trataria módulo pronto como ausente — e foi o que o
mapa de lacunas precisou corrigir em 2026-09-11.

**Status de módulo não mora em documento.** Mora em três lugares que não envelhecem
sozinhos:

- `modules/` e `adapters/` — o que existe no disco, com o `MODULO.md` de cada um;
- `ESTADO-EXECUCAO.md` — o que o último lote provou, com comando e resultado;
- `docs/edital/catalogo-execucao.json` — quanto do edital cada seção atende, por
  cláusula e com evidência.

A numeração dos módulos é definitiva e segue a ordem de dependência real: quem tem
código mantém o número.

## Estrutura do repositório

```
CLAUDE.md                     ← as regras (carregado sozinho em toda sessão)
ESTADO-EXECUCAO.md            ← o checkpoint entre lotes
docs/LEIA-ME.md               ← o índice de todos os documentos
docs/instrucoes/arquitetura.md← este arquivo
docs/instrucoes/MODULO.template.md ← base do MODULO.md de cada módulo
prisma.config.ts              ← config Prisma 7 (schema multi-arquivo)
prisma/schema/                ← *.prisma (base + 1 arquivo por módulo)
packages/contracts/           ← tipos compartilhados + Zod (money, periodo)
packages/ledger/              ← motor de partidas dobradas (domain puro, zero I/O)
modules/                      ← uma pasta fechada por módulo
lib/molde/ e components/molde/← o descritor de recurso e a superfície que ele monta
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

O container de desenvolvimento em uso nesta máquina (conferido em 2026-09-12):
**`pg-gestao-publica`, `postgres:18`, usuário `gestao`, base `gestao_publica`, porta
`5436`.** A senha está no `.env`, não aqui.

```bash
# Postgres descartável
docker run --name pg-gestao-publica -e POSTGRES_USER=gestao -e POSTGRES_PASSWORD=<senha> \
  -e POSTGRES_DB=gestao_publica -p 5436:5432 -d postgres:18

npx prisma migrate dev   # aplica as migrations versionadas

# SQL fora do alcance do Prisma (índices parciais etc.) — passo separado,
# OBRIGATÓRIO em todo ambiente novo. Ver prisma/sql/ e scripts/aplicar-sql-manual.ts.
npx tsx scripts/aplicar-sql-manual.ts
```

⚠️ **O `.env.example` ainda mostra a porta 5432 e o nome antigo.** Pendência
`ENV-EXAMPLE-DESATUALIZADO` — corrigi-la é mexer em configuração, e este lote é
documental. Quem subir ambiente novo confere o container antes do arquivo.

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
