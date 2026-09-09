# POC SIAFIC — SEFIN Campina Grande/PB (Pregão 330/2026)

Demonstração **executável, honesta e rastreável** de um SIAFIC municipal: escrituração pelo funil
contábil real, relatórios legais, e as integrações com o TCE-PB (SAGRES) e o Banco do Brasil. Tudo
roda com **massa sintética** e **modos explícitos** — nada aguarda credencial externa, e nada finge
transmissão que não aconteceu.

> **HEAD definitivo da POC:** commit **`3a08ae58fda963562b3fe13755f2eefd7cd5849b`**,
> apontado pela tag **`poc-v1.0`** (`git show poc-v1.0`).
> Esta é a última sessão de código: o que está nessa tag é o produto congelado.
>
> *(O hash acima é o do commit que congela a POC. Este parágrafo é a única linha
> gravada depois dele — um commit não pode conter o próprio hash; o registro fica
> num commit-selo logo em seguida, e a tag `poc-v1.0` permanece no HEAD definitivo.)*

---

## 1. O que a POC demonstra

| Capacidade | Estado | Onde |
|---|---|---|
| **SAGRES 2026 — TXT** (diário/mensal, largura fixa) | ✅ **10 de 13** entidades geram, validam e empacotam | `/integracoes/sagres` |
| **SAGRES Captura 2.0 — JSON** | ✅ mesma massa em JSON, validada no **schema oficial**, simulada (MOCK→SIMULATED) | `/integracoes/captura` |
| **Banco do Brasil** (extrato/saldo, leitura) | ✅ importação por fixture + conciliação; modos MOCK/SANDBOX/LIVE | massa POC + `/integracoes` |
| **API de consulta TCE** | ✅ mock contratual (3/32 rotas) — comparação **dados locais × TCE** | `/integracoes/tce` |
| **Importadores parametrizáveis** (folha, tributário) | ✅ layout configurável, idempotente por hash do arquivo | `/integracoes/importadores` |
| **Execução da despesa** (empenho→liquidação→pagamento) | ✅ pelo funil `razao.ts`, com ordem cronológica (art. 141) | `/despesa/*` |
| **Receita orçamentária** | ✅ arrecadação, guia, estorno/retificação | `/receita/arrecadacoes` |
| **Créditos adicionais** | ✅ decreto + movimento, QDD com dotação atualizada, relatório 4.40 | `/planejamento/*`, `/relatorios/atualizacoes-orcamentarias` |
| **Extraorçamentário** (consignações/retenções) | ✅ saldo por consignatário, recolhimento com trava | `/financeiro/extraorcamentario` |
| **Patrimônio** | ✅ bens, reavaliação, depreciação, posição por classe | `/patrimonio/bens` |
| **Relatórios legais** | ✅ RREO (10 anexos), RGF (6 anexos), livros (diário/razão/balancete) | `/relatorios/*` |
| **Transparência** | ✅ dado aberto (CSV RFC-4180) + demonstrativos públicos | `/transparencia` |
| **Impressão/PDF** | ✅ documentos e listas operacionais, com hash de conteúdo no rodapé | rotas `*/pdf`, `*/ne`, `*/guia`, `*/decreto` |
| **Administração** | ✅ usuários, perfis, permissões (censo), auditoria | `/administracao/*` |

---

## 2. Hierarquia de evidência (o que cada prova significa — PATCH §6)

A POC **nunca** apresenta prova local como aceitação externa:

| Evidência | O que prova | O que **não** prova |
|---|---|---|
| Golden byte a byte (TXT) | formatação determinística conforme o layout local | aceitação do TCE |
| JSON conforme schema oficial (ajv) | conformidade com o contrato de **dados** do TCE | que o TCE recebeu |
| Manifesto SHA-256 | integridade **local** do pacote | procedência externa |
| Estado `SIMULATED` + `simulationId` | **simulação local**, id interno | jamais aceite/protocolo/recibo do TCE |
| `CREDENTIAL_NOT_CONFIGURED` | transporte preparado, aguardando credencial (sem fallback silencioso) | que o canal funciona ponta a ponta |
| **Validação/recibo do TCE** | ❌ **não existe nesta POC** — exige o ambiente/transmissão real | — |

Cada tela de integração exibe o **modo permanentemente** e o banner:
*"formato oficial gerado e validado localmente · transmissão externa não realizada"*.

---

## 3. Matriz SAGRES — 10 de 13 entidades

A matriz completa, com a origem real de cada campo, está em `adapters/tribunais/tce-pb/sagres/MODULO.md` e é
exibida na própria tela `/integracoes/sagres`.

| § | Entidade | Period. | Estado | Origem / motivo |
|---|---|---|---|---|
| 4.4 | Dotacao | Mensal | ✅ | `FichaOrcamentaria` |
| 4.8 | Empenhos | Diário | ✅ | `Empenho` + ficha |
| 4.10 | Liquidacao | Diário | ✅ | `Liquidacao` + empenho |
| 4.12 | Pagamentos | Diário | ✅ | `Pagamento` + conta pagadora |
| 4.14 | **Retencao** | Diário | ✅ | M07 ingresso com `pagamentoId`; **de-para explícito** `TipoConsignacao` → `TipoRetencao` (§5.24) |
| 4.16 | ReceitaOrcamentaria | Diária | ✅ | `ReceitaArrecadada`; conta arrecadadora é parâmetro de exportação |
| 4.20 | **DespesaExtra** | Diária | ✅ | M07 dispêndio; fonte STN (860/861/862/869) é parâmetro de exportação |
| 4.23 | CadastroContaBancaria | Diário | ✅ | `ContaBancaria` (tripla banco/agência/conta) |
| 4.26 | SaldoMensal | Mensal | ✅ | soma do extrato até o fim do mês |
| 4.59 | MovimentacaoEntreContas | Diária | ✅ | `TransferenciaEntreContas` |
| 4.13 | EstornoPagamento | Diário | 🟡 | falta a coluna **`motivo`** (obrigatória no layout) — estruturá-la é decisão do Winner |
| 4.1 | UnidadeOrcamentaria | Mensal | 🟡 | faltam `nomeSecretario`/`cpfSecretario`/`atoAdministrativo`/`tipoNaturezaJuridica` no modelo |
| 4.27 | ConciliacaoBancaria | Mensal | 🟡 | `VinculoConciliacao` existe; campos do layout não mapeados |

**Gaps nomeados nas duas entidades novas** (nunca preenchidos com valor plausível):
`DespesaExtra.cpfCnpjFornecedor` → zeros (o M07 guarda o consignatário como **nome livre**, não
documento); `DespesaExtra.co` → zeros (o dispêndio extra não tem CO no modelo); o vínculo com
`ReceitaExtra` → **espaços (ASCII 32)**, como o layout manda quando não é exigido. Um tipo de
consignação **sem de-para** para o §5.24 **falha nomeando** — nunca cai em "5 = Outras" por omissão.

---

## 4. Massa sintética (POC)

UG **"PREFEITURA MODELO — POC"** (código 99/99001, UG SAGRES 999001), CNPJ e pessoas **fictícios**
(CPFs com dígito verificador válido, nunca reais). História encadeada, pelo funil contábil real:

| Período | Fato |
|---|---|
| 05/jul | receita orçamentária arrecadada (80k) |
| 10–14/jul | empenho → liquidação → pagamento (50k) |
| 15/jul | 2 contas bancárias + transferência (2,5k) + extrato BB (fixture) + conciliação |
| 05–08/ago | segunda cadeia empenho → liquidação → pagamento (20k) |
| 10–14/set | terceira cadeia (10k) **com retenção de ISS na fonte (500)** — alimenta o §4.14 |
| 20/set | recolhimento parcial do ISS (300) — alimenta o §4.20; saldo do consignatário fica 200 |
| out | 2 bens (móvel 50k + imóvel 200k), reavaliação (+20k), depreciação do móvel |
| — | 1 decreto de crédito (remanejamento 5k, balanceado por fonte) |

Determinística e idempotente. **Nenhum usuário é criado pela massa** — a identidade que assina
pré-existe (`seed:bootstrap`).

---

## 5. Modos (nenhum fallback silencioso — o modo exibido é o que executa)

- **MOCK** — fixtures locais, sem chamada externa (o caminho da demonstração).
- **SANDBOX** — homologação real; sem credencial responde `CREDENTIAL_NOT_CONFIGURED` (nomeado).
- **LIVE** — bloqueado nesta missão (nenhuma chamada financeira real).

---

## 6. Fontes oficiais versionadas

Em `docs/oficial/tce-pb/` (procedência + SHA-256 em `MANIFEST.json`): layout SAGRES Contabilidade
2026 v1.1; PCASP 2025; subelementos e relações; **JSON Schemas do Captura 2.0** (draft 2020-12);
**OpenAPI** do Captura 2.0 (submissão) e da API de consulta. Nada de campo/posição/domínio/endpoint
inventado — **o arquivo local manda**.

---

## 7. Roteiro de subida, do zero (banco de demonstração limpo)

```bash
# 0) pré-requisito: Postgres de pé e DATABASE_URL no .env
#    ex.: postgresql://siafic:siafic@localhost:5432/siafic_cg?schema=public

1. npx prisma migrate deploy       # schema completo (todas as migrations da POC)
2. npm run db:sql                  # ⚠️ INDISPENSÁVEL — ver "Achado A" abaixo
3. SEED_ADMIN_SENHA='<>=12 chars>' npm run seed:bootstrap   # ⚠️ ver "Achado B"
4. npm run seed:pcasp              # plano de contas (64 contas)
5. npm run seed:sagres-poc         # a massa POC encadeada (idempotente)

# subir
npm run build && npm start         # produção (porta 3000)
# ou: npm run dev
```

Login: `admin@cg.pb.gov.br` com a senha que **você** definiu em `SEED_ADMIN_SENHA`.

### ⚠️ Achado A — `npm run db:sql` não é opcional

`prisma migrate deploy` **não** cria os índices parciais nem os CHECKs condicionais de `prisma/sql/`
(17 arquivos): o `schema.prisma` não sabe expressá-los. Sem esse passo, o banco sobe **sem as travas
de append-only** (duplo estorno, dotação inicial única, XOR do movimento contratual) — e o problema é
silencioso, porque a suíte de testes aplica esse SQL sozinha (`test/global-setup.ts`) e passa. O
script `scripts/aplicar-sql-manual.ts` fecha o buraco e é idempotente.

### ⚠️ Achado B — a senha do admin é exigida em runtime, sem default

`seed:bootstrap` **recusa** criar o usuário sem `SEED_ADMIN_SENHA` (mínimo 12 caracteres), e não há
senha padrão no código **de propósito**: uma default nasceria igual em toda instalação e ficaria
versionada, pública, para sempre. O erro é nomeado e nada é gravado. Troque a senha no primeiro acesso.

---

## 8. Roteiro de demonstração (~10–15 min)

Comece na Central (`/integracoes`) — os 4 canais com o modo de cada um e o último evento.

1. **SAGRES TXT** (`/integracoes/sagres`) → a **matriz 10/13** na própria tela; escolha um **dia com
   movimento** (os atalhos estão na tela) → prévia monoespaçada com **régua de posições**, lista de
   validações, download do pacote `.zip` + `manifesto.json` (SHA-256 por arquivo + hash do pacote).
   Sugestão: `2026-09-14` (mostra a **Retencao**) e `2026-09-20` (mostra a **DespesaExtra**).
2. **Captura 2.0** (`/integracoes/captura`) → JSON por entidade, validado no schema oficial →
   "Simular submissão (MOCK)" → linha do tempo `DRAFT → VALIDATED_LOCAL → SUBMITTED_MOCK → SIMULATED`
   com o `simulationId` **interno**.
3. **Banco do Brasil** → modo (MOCK) e estado do SANDBOX; a massa já traz o extrato importado e o
   pagamento **conciliado**.
4. **API TCE** (`/integracoes/tce`) → comparação **dados locais × TCE**: iguais, divergentes (a
   divergência proposital do empenho nº 1), só-local, só-TCE. **MODO MOCK** permanente.
5. **Importadores** (`/integracoes/importadores`) → folha e tributário por layout parametrizável;
   reimportar o mesmo arquivo é **no-op** (idempotência por hash).
6. **A escrituração por trás**: `/despesa/empenhos` (com Nota de Empenho em PDF), `/despesa/liquidacoes`,
   `/despesa/pagamentos` (fila da ordem cronológica, art. 141), `/receita/arrecadacoes` (com guia),
   `/planejamento/creditos-adicionais` (decreto em PDF), `/planejamento/qdd` (dotação atualizada),
   `/relatorios/atualizacoes-orcamentarias` (TR 4.40, com PDF/CSV), `/financeiro/extraorcamentario`
   (saldo por consignatário), `/patrimonio/bens` (posição por classe).
7. **Relatórios legais**: `/relatorios/rreo/*` (10 anexos), `/relatorios/rgf/*` (6 anexos),
   `/relatorios/livros/*` (diário, razão, balancete), `/relatorios/consistencia`.

---

## 9. Pacote de contingência (se a aplicação não subir)

```bash
npm run poc:contingencia
```

Gera a pasta **`CONTINGENCIA/`** (fora do git) com **todos os artefatos de todos os períodos que têm
movimento no banco** — os períodos são **descobertos do banco**, não fixados numa lista:

- `sagres/diario/<aaaa-mm-dd>/` — os 8 arquivos diários + ZIP + `manifesto.json`, por dia;
- `sagres/mensal/<aaaa-mm>/` — Dotacao + SaldoMensal + ZIP + `manifesto.json`, por mês;
- `captura/` — envelope JSON validado no schema oficial, com a trilha de estado até `SIMULATED`;
- `pdf/` — Nota de Empenho, decreto, posição patrimonial, extraorçamentário, transparência (RREO
  anexo 1), empenhos, liquidações, arrecadações;
- `csv/` — dado aberto de despesa e receita (RFC-4180);
- **`MANIFEST-CONTINGENCIA.json`** — o SHA-256 de **cada** artefato, com uma linha dizendo o que prova.

O script é **leitura pura**: não escreve no banco. Por isso a trilha da Captura usa as transições
puras da máquina de estados em vez de `submeterCaptura` (que persistiria uma execução).

---

## 10. O que depende de token/contratação externa

- **Captura 2.0 SANDBOX/LIVE** — usuário de testes do TCE + endpoints de submissão (OpenAPI já
  versionado; faltam a credencial e a construção do transporte real).
- **API de consulta TCE SANDBOX/LIVE** — token do TCE (o gateway MOCK e a comparação já rodam;
  SANDBOX/LIVE ativam-se por configuração, **sem mudar código**).
- **Banco do Brasil SANDBOX** — credenciais de homologação (`BB_APP_A_*` em `.env.local`).
- **Rol oficial de tipos de consignação** — pendente de token ASTEC; o seed usa 7 tipos declarados
  como **não-oficiais**, e o de-para para o §5.24 é explícito e fail-closed.

Nenhuma dessas trava a demonstração: tudo acima roda em MOCK/simulação, com o estado real à vista.

---

## 11. Gates desta POC

```bash
npm test                  # suíte completa (vitest, contra Postgres de teste isolado)
npm run typecheck         # domínio (modules/, packages/)
npm run typecheck:app     # aplicação (app/, components/, lib/)
npm run typecheck:scripts # scripts operacionais (scripts/) — atravessa as duas metades
npm run build             # build de produção Next.js

# selo visual — exige o servidor de produção de pé
npx next start -p 3001 &
npm run smoke:visual -- http://localhost:3001 admin@cg.pb.gov.br '<senha>'
```

**Sobre o `smoke:visual`.** Ele abre um **Chromium de verdade**, faz **login de verdade** (as rotas
são protegidas — sem sessão respondem 307 e não há tela para inspecionar) e mede o **estilo
computado** dos elementos: a fonte Inter no `body`, o **campo de 44px** (`h-11`) e o **card de 20px**
(`p-5`). Existe porque nenhum dos outros gates cobre isso: `build` verde prova que **compilou**, não
que a tela tem estilo. O detector ignora a barra lateral e o topo (`[data-chrome]`), que têm escala
própria e menor de propósito — medi-los com a régua do conteúdo daria falso positivo em toda tela.

**Nota:** não existe rota `/contabilidade/plano-de-contas` nesta POC. O plano de contas (PCASP) é
semeado por `npm run seed:pcasp` e aparece nos relatórios e no razão, mas **não tem tela própria** —
registrado aqui para que ninguém a procure na demonstração.
