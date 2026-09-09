# M19 — API de Consulta TCE-PB (mock contratual)

**DIRETIVA §3** · **Missão POC, Sessão S4**. Status: **verde — mock contratual sobre o OpenAPI
oficial**. Gateway de consulta **separado** do Captura 2.0 (submissão): outra API, outro contrato.

Fonte: `docs/oficial/tce-pb/openapi-sagrescaptura.json` (Swagger 2.0, **32 rotas GET**, sha256 no
MANIFEST). Os schemas de RESPOSTA das rotas do recorte foram resolvidos para `schemas-consulta-2026.json`.

## Recorte 3(b) — 3 de 32 rotas (a cadeia da massa POC, com dono local)

| Rota | Filtro | Dono local | Estado |
|---|---|---|---|
| `GET /api/v1/dotacoes` | codUnidadeGestora + exercicio | `FichaOrcamentaria` / `DotacaoFato` | ✅ mock + fixture conforme |
| `GET /api/v1/empenhos` | codUnidadeGestora + dataMin/Max | `Empenho` / `EmpenhoFato` | ✅ mock + **comparação local × TCE** |
| `GET /api/v1/pagamentos` | codUnidadeGestora + dataMin/Max | `Pagamento` (sem exporter próprio) | ✅ mock + fixture conforme |

**As outras 29 rotas** (restos, folha/servidores, estornos, retenções, receitas, etc.) ficam
**versionadas, não implementadas** — o contrato está no repo; a construção fica fora do escopo da demo.
Justificativa do recorte: só estas três sustentam a comparação "dados locais × TCE" da massa POC
(LOA → empenho → pagamento) e têm origem interna comparável.

## O contrato manda, a fixture obedece (F2)

As fixtures do MOCK (`fixtures-poc.ts`) são **validadas contra o schema de resposta oficial** (`ajv`,
via `validarRespostaTce`). Uma fixture que viola o contrato (valor string, campo obrigatório ausente)
**não passa no teste** — nada de retorno inventado (DIRETIVA §3). Os dados são coerentes com a massa
POC (mesma UG 999001, mesmos períodos), com **UMA divergência proposital**: o empenho nº 1 volta com
valor `50000,50` (o local é `50000,00`).

## Gateway + modos (F1)

`gateway.ts`: MOCK / SANDBOX / LIVE explícitos. **Token só por configuração.** MOCK devolve as
fixtures; SANDBOX/LIVE sem token → `CREDENTIAL_NOT_CONFIGURED` (nomeado, **nunca** fallback para MOCK).
Cada consulta é **logada** (`RegistroDeOperacao` + correlation) pela porta — **nunca** com token.

## Comparação local × TCE (F3) — ela LÊ, não recalcula

`comparar.ts` casa os empenhos locais (o DTO da S1) com o retorno do TCE pela chave (número do
empenho) e classifica cada linha: **IGUAL / DIVERGENTE / SÓ-LOCAL / SÓ-TCE**. Nenhuma aritmética
nova — os valores já existem dos dois lados. A tela (`/integracoes/tce`) exibe lado a lado, com
**MODO MOCK permanente** e o banner honesto §7 ("retorno sintético — simulação executada").

## Evidência (§6 / §7)

Fixture conforme ao schema = o mock respeita o **contrato de resposta** do TCE. A comparação prova que
o pipeline **detecta divergência**. Mas nada aqui é consulta real: **retorno sintético**, sem token,
sem chamada externa. SANDBOX/LIVE ativam-se por credencial, sem mudar código.
