# PATCH DE DESPACHO — MISSÃO POC (v2 · autoridade: Winner)

> Este documento tem **AUTORIDADE sobre PROMPT-MESTRE.md** em qualquer conflito.
> O baseline vigente (hash + contagem de testes) é informado **no despacho de cada sessão** — nunca aqui.
> v2 incorpora revisão externa de 18/07/2026 (autoridade documental, competência, hierarquia de evidência).

## 1. BASELINE

- O prompt mestre cita auditoria desatualizada ("404 testes falhando") = suíte rodada **sem o Docker pg-siafic** (FAIL-HARD por design). **Não existe baseline quebrado.**
- Baseline real = hash informado no despacho da sessão, suíte 100% verde. Teste vermelho a partir do despacho = **REGRESSÃO SUA**. Ignorar as instruções do prompt mestre sobre "falhas preexistentes".

## 2. JÁ FEITO — NÃO REESCREVER (M17-a)

- `lib/portas/banco-provider.ts` (leitura), OAuth com cache + `RATE-LIMIT-HOMOLOG` fail-closed (10/10min homolog), normalização API→`TransacaoOfx` via `montarTransacaoOfx`, `importarExtratoBb` idempotente por origem, migração `OrigemExtrato`, `EventoChamadaBb` cego a credencial, `scripts/bb-smoke.ts`, `SPEC_BB` centralizado (premissas CONFIRMAR NO SWAGGER).
- §4 do prompt mestre (BB) reduz-se a: (a) retrofit MOCK/SANDBOX/LIVE; (b) `testConnection`; (c) mascaramento agência/conta em UI e logs; (d) card na Central. **Pagamento/transferência (dry-run) = sessão M17-b SEPARADA, fora desta missão.**

## 3. REGRA CROSS-ORIGEM OFX × API BB (fecha a premissa nomeada da M17-a)

- Cobertura de origem controlada por **(contaBancariaId, competência `YYYY-MM`)**. Dentro da mesma competência, **uma única origem** produz transações: `API_BB` ou `OFX`.
- Reimportação da **mesma** origem permanece idempotente (no-op). Tentativa da **segunda** origem → recusa nomeada **`ORIGEM-CONFLITANTE-COMPETENCIA`**.
- Conta declara origem preferencial com vigência (`origemPreferencialDesde`); troca de origem só para competências **futuras ou ainda sem importação**.
- Verificação de conflito **dentro de transação de banco** (importações concorrentes não furam a regra).
- Deduplicação cross-origem futura **somente** por ID bancário oficial estável (se o Swagger/smoke real do BB expuser); **nunca** por heurística data+valor. Sem override silencioso.

## 4. FONTES OFICIAIS — AUTORIDADE DOCUMENTAL

- Este ambiente **NÃO acessa a web**. As fontes oficiais **deverão estar** versionadas em `docs/oficial/tce-pb/` — **não presumir que estejam**. No Passo 0: confirmar existência, versão e integridade, e **calcular/gravar os SHA-256 no `MANIFEST.json`** (campos de procedência — fonte, url, versão, datas — são preenchidos pelo Winner; o hash é calculado pelo executor sobre o arquivo do repo).
- **A versão-alvo é SAGRES Contabilidade 2026 — versão 1.1, publicada em 12/12/2025**, ou versão oficial posterior devidamente versionada no diretório. "2026 v1" **não** é a referência final.
- Arquivo exigido pela sessão e ausente = capacidade **BLOQUEADA** nomeando exatamente a fonte que falta. **PROIBIDO** inventar campo, posição, domínio ou endpoint (lição 7.9: dois DeParas concordando estavam ambos errados).
- Para **Captura 2.0 e API TCE (S3/S4), PDF não basta**: exigir OpenAPI/Swagger, JSON Schemas e tabelas de domínio em `docs/oficial/tce-pb/`. Ausência bloqueia o **transporte real** (mock contratual continua possível apenas sobre schema oficial versionado — sem schema, sem contrato inventado).
- Fatos já verificados pelo chat (conferir contra o arquivo local — **o arquivo local manda**; divergência é reportada no bloco verde): UTF-8; valores posicionais com zeros à esquerda e VÍRGULA decimal (16 pos = 13 int + vírgula + 2 dec → `0000002547625,21`); datas `ddmmaaaa`; caractere sem apóstrofo/aspas; campo não exigido = espaços ASCII 32; nome de arquivo inicia por `codUG` (diário `[codUG][ddmmaaaa][Nome].txt`, mensal `[codUG][mmaaaa][Nome].txt`, anual `[codUG][aaaa][Nome].txt`); extraorçamentário fontes STN 860/861/862/869; relacionamento `Retencao` obrigatório quando a conta contábil exigir (coluna "Exige Retenção?" do PCASP oficial).

## 5. DISCIPLINA DE SESSÃO (sobrepõe o "implemente por fases" do prompt mestre)

Sessões com Passo 0, ~4 frentes disjuntas, 4 gates (`vitest run` sem pipe + tsc backend + tsc app + `next build`) e **BLOCO VERDE ÚNICO commitado** (contagem de arquivos, zero Errors). Parar no verde. Executar **somente** a sessão nomeada no despacho.

**GATE DE ESCOPO (pré-requisito da S1, dentro do Passo 0):** antes de implementar qualquer entidade, produzir a matriz
`requisito POC (12.1) → entidade SAGRES → periodicidade (diária/mensal) → origem real no modelo (tabela/campo) → arquivo oficial → teste → evidência`
e implementar **primeiro o menor conjunto que cubra integralmente o roteiro formal da POC** (TR 4.20.2: a comissão escolhe um dia/mês para SAGRES Diário e Mensal). Entidade sem origem real no modelo = "não suportada por ausência de origem" na matriz — **nunca linha vazia**.

| Sessão | Escopo |
|--------|--------|
| **S1** | SAGRES TXT 2026 **v1.1**: gate de escopo + registry declarativa por versão + formatadores + vertical slice das entidades com origem real + golden files byte a byte + nomenclatura oficial |
| **S2** | Validações do pacote + ZIP/manifesto SHA-256 + prévia monoespaçada/download na UI |
| **S3** | Captura 2.0 JSON: mesmo DTO canônico, transport Mock/Sandbox/Live, estados `DRAFT→…→SIMULATED` (mock **nunca** `ACCEPTED`); exige OpenAPI/Schemas oficiais no repo |
| **S4** | Consultas API TCE: gateway **separado** do Captura; fixtures contratuais sobre schema oficial; `MODO MOCK` destacado; token só por configuração |
| **S5** | Contabilização automática: regras de parametrização + prévia + 3 casos POC pelo funil `razao.ts`; aprovação humana quando não determinístico; **sem IA generativa** escolhendo conta |
| **S6** | Central de Integrações + retrofit de modos no BB + massa POC encadeada + `README-POC.md` e artefatos de evidência |

Regras transversais: golden file **nunca** se auto-atualiza; alteração exige conferência contra `docs/oficial/`. Censo M16 para todo serviço novo de mutação; grep trivalente nas telas novas. Máscaras BR em todo campo de UI (máscara é apresentação, o dado cru atravessa).

## 6. HIERARQUIA DE EVIDÊNCIA E CREDENCIAIS

- **Golden file prova determinismo local, não aceitação pelo TCE.** Classificação obrigatória nas evidências e na UI:

| Evidência | O que prova |
|-----------|-------------|
| Golden byte a byte | Formatação determinística |
| Validador local | Conformidade com as regras implementadas |
| Comparação com layout oficial | Correspondência de campos e posições |
| Validação no ambiente TCE | Aceitação técnica externa |
| Recibo do TCE | Transmissão efetivamente recebida |

  Status de conformidade **externa** exige validação ou recibo do ambiente oficial — a UI e os relatórios nunca apresentam prova local como aceitação externa.
- **Duas credenciais TCE distintas, nunca confundir:** (a) API de consulta SAGRES vigente — atendimento a empresas **com contrato em vigor** com jurisdicionados; (b) **usuário de testes do Captura 2.0** — fornecedores de SIAFIC convidados aos testes de 2026 (obrigatório a partir de 2027). A empresa está em fase de pregão (PE 330/2026): o pleito correto é acesso ao ambiente de **testes** do Captura 2.0 + orientação sobre a API de consulta + UG fictícia/homologação + OpenAPI/schemas atualizados. **Proibido** declarar em qualquer artefato que a empresa possui direito vigente à chave da API de consulta.
