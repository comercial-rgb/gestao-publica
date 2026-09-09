# M18 — SAGRES Captura 2.0 (JSON)

**Requisito POC 12.2 / DIRETIVA §2** · **Missão POC, Sessão S3**. Status: **verde sobre o contrato
oficial**. A MESMA massa do TXT (M15), em JSON, validada contra os **JSON Schemas oficiais** e
simulada (MOCK → SIMULATED). Nada de transmissão real (DIRETIVA §7).

Fonte: `docs/oficial/tce-pb/captura20-entidades-contabilidade.html` — **41 JSON Schemas oficiais
(draft 2020-12)** embutidos, extraídos para `schemas-captura-2026.json` (sha256 no MANIFEST). Nada
inventado (PATCH §4).

## RAMO 3(c) — schemas PRESENTES → F2/F3 sobre o contrato oficial

A estante pública do Captura 2.0 traz os **schemas das entidades** (machine-readable) e as **tabelas
de domínio**. Então:
- **F1/F2 COMPLETOS sobre o contrato oficial:** o JSON é validado por `ajv` (draft 2020-12) contra o
  schema baixado — required/minLength/maxLength/pattern/enum/type, cada violação nomeando o campo.
- **O que fica bloqueado, nomeando:** o **contrato de TRANSPORTE** (OpenAPI/Swagger dos endpoints de
  submissão + autenticação real) **não** está na estante. Por isso SANDBOX/LIVE respondem
  `CREDENTIAL_NOT_CONFIGURED` — o **MOCK e a validação por schema não dependem dele** (o transporte
  real é a ativação por credencial, sem mudar código). Ver `MANIFEST.pendentes`.

## F1 — o DTO tem UM dono (TXT e JSON são duas serializações)

`dto-captura.ts` NÃO recalcula nada: cada campo já existe no `*Fato` que a registry da S1 produz.
Aqui só se traduz o **nome** (`cod*` → `codigo*`), o **formato** (valor string-vírgula do TXT → number
do JSON; `exercicioFonte` 1/2 → enum `ATUAL`/`ANTERIOR`) e a **estrutura** (envelope `{ timestamp,
elementos }`). **A migração de 2027 para o Captura 2.0 não reescreve o motor — troca a serialização.**

## F3 — o estado é o que ACONTECEU

`DRAFT → VALIDATED_LOCAL → SUBMITTED_MOCK → SIMULATED` (terminal); o caminho inválido termina em
`REJECTED_LOCAL`. **Não existe estado "aceito"/"transmitido".** O MOCK gera só um `simulationId`
interno (uuid) — **proibido** campo protocolo/recibo/aceite. **SANDBOX/LIVE sem credencial →
`CREDENTIAL_NOT_CONFIGURED` (erro nomeado), NUNCA fallback silencioso para MOCK** — o modo que executa
é o modo que a tela mostra. Cada submissão persiste `ExecucaoCaptura` (correlation ID, modo, estado,
hash do payload, simulationId, violações) + `RegistroDeOperacao`. Censo M16: `SUBMETER_CAPTURA`.

## Matriz entidade → schema oficial → origem (as 6 que a S1 já produz)

| Entidade Captura | Schema oficial | Origem (DTO S1) | Observação |
|---|---|---|---|
| dotacao | "Lista de Dotações" | `DotacaoFato` (FichaOrcamentaria) | ✅ valida limpo |
| empenhos | "Empenhos" | `EmpenhoFato` (Empenho+Ficha) | ✅ (S6) — `cpfOrdenador` herdado do `EnteConfig` (identificação do ente); valida limpo. Gap da S3 quitado. |
| liquidacao | "Liquidações" | `LiquidacaoFato` | ✅ (NF opcional) |
| cadastroConta | "Conta Bancária" | `CadastroContaFato` (tripla S2) | ✅ |
| saldoMensal | "Lista de Saldos Mensais" | `SaldoMensalFato` (SUM extrato) | ✅ |
| movimentacao | "Lista de Transferências Bancárias" | `MovimentacaoFato` (TransferenciaEntreContas) | ✅ |

As outras 35 entidades do schema oficial ficam versionadas em `schemas-captura-2026.json`, prontas
para novos mapeadores (mesma doutrina), quando a origem interna existir.

## Evidência (PATCH §6 / DIRETIVA §7)

| Evidência | Prova |
|---|---|
| JSON conforme o schema oficial (ajv) | conformidade com o contrato de DADOS do TCE |
| Estado SIMULATED + simulationId | **simulação local** — jamais aceitação externa |
| `CREDENTIAL_NOT_CONFIGURED` | o transporte real está preparado, aguardando credencial |
| **Aceite/recibo do TCE** | ❌ — exige transmissão real (endpoints pendentes) |

A tela (`/integracoes/captura`) exibe o **modo permanentemente** e o banner: "JSON gerado e validado
localmente · Transmissão externa NÃO realizada".
