# Fundação visual e borda de leitura — app shell (Next.js)

A camada de UI do SIAFIC: shell (sidebar · header · main · footer), tokens de design, componentes
base, e a **borda** que liga a tela ao domínio (`lib/portas/**`). O domínio M01-M16 e `packages/`
seguem intactos — a UI **nunca** os importa direto.

## 1. A fronteira UI ↔ domínio (grep-teste TRIVALENTE)

`test/ui/fronteira-ui.test.ts` varre `app/**`, `components/**` e `lib/**` e falha **nomeando o
infrator**. Três zonas, três regras:

1. **UI** (`app/**`, `components/**`, `lib/**` exceto `lib/portas/**`) não importa domínio
   (M01-M16) nem Prisma.
2. **Portas** (`lib/portas/**`) podem importar o domínio e o Prisma — é a função delas — mas não
   importam `components/**`: a porta é dado, não pixel.
3. Uma ilha **client** (`"use client"`) não importa uma porta: a porta puxa o Prisma, que não
   bundla para o browser. A leitura mora no Server Component; o client recebe já-lido.

O compilador não pega nada disso (são imports válidos); o grep pega.

## 2. As portas de hoje

| Porta | O que serve | Escrita? |
|---|---|---|
| `sessao.ts` | `exigirSessao`, `entrar/encerrar`, `comEscritaAutenticada` | — (é a borda) |
| `cliente.ts` | o client Prisma singleton + `PortaSemBancoError` | — |
| `rreo.ts` | RREO (anexos 1,2,3,7,8,11,12,13) e RGF anexo 1 | não |
| `livros.ts` | Diário, Razão, Balancete | não |
| `planejamento.ts` | reprevisão de receita | **sim** (`registrarReprevisao`) |
| `administracao.ts` | usuários, perfis | **sim** (trocar a própria senha) |
| `auditoria.ts` | `RegistroDeOperacao` (filtros, paginação) | não |
| `empenho.ts` | empenhos + saldos da TR 5.17 · **o dossiê de UM empenho** (origem, liquidações, retenções, pagamentos, anulações, razão e histórico) | **sim** (`registrarEmpenho`) |
| `liquidacao.ts` | liquidações + empenho de origem | **sim** (`registrarLiquidacao`) |
| `pagamento.ts` | a fila do art. 141 (M06 × M05) · tipos de consignação para a retenção | **sim** (`registrarPagamento`, com retenção) |
| `arrecadacao.ts` | guias do exercício + rol da LOA | **sim** (`registrarArrecadacao`) |
| `pessoas.ts` | cadastro de pessoas e credores (M19), com papéis e histórico | **sim** (cadastrar, alterar, mover papel) |

**Toda escrita passa por `comEscritaAutenticada`**: exige sessão (fail-closed), injeta o
`criadoPor` real e grava `RegistroDeOperacao`.

> ⚠️ **Esta coluna dizia "não — ver §5" nas quatro portas de execução, enquanto o próprio §5
> dizia que elas escrevem desde a 7.3.** Duas afirmações opostas no mesmo documento: quem lesse
> a tabela concluiria que a tela não grava. Corrigido junto com a entrada da retenção.

## 3. Dinheiro atravessa a UI como STRING

`ValorMonetario` recebe `valor: string`, **nunca `number`** — a regra de ouro do domínio
(`Decimal(18,2)`) chega até a tela. A formatação é a função pura `formatarMoeda` (testada sem
React): `"1234567.89"` → `"1.234.567,89"`, `"-1234.50"` → `"(1.234,50)"` (parênteses contábeis +
vermelho). Passar `number` é **erro de compilação**. Formata por parse textual, não `Number()`.

**As portas convertem `Decimal` → `string` na borda** e não derivam nada: quem soma é o módulo
(`modules/*/consultas.ts`). Um `SUM` novo numa porta seria a segunda verdade sobre o mesmo fato.

## 4. Server Components + ilhas client mínimas

Quase tudo é Server Component. Ilhas `"use client"` só onde há estado/interação:
`UiContextProvider`, `Sidebar` (`usePathname` + colapso), `Breadcrumb`, `Seletores`,
`SincronizarContexto`, e os formulários. O colapso da sidebar é lido de um **cookie no servidor**
→ SSR já renderiza no estado certo, sem flash.

**`SincronizarContexto`** é a ponte UiContext → URL: Server Component não lê contexto client, então
a ilha empurra `?exercicio=&ug=` e o servidor re-renderiza. A URL leva o **código** da unidade
(identificador de domínio), não o `id` do contexto (que hoje é mock).

## 5. A ESCRITA DA EXECUÇÃO — ✅ religada na 7.3

As quatro telas (empenho, liquidação, pagamento, arrecadação) **escrevem**. A 7.1 as
entregou só-leitura porque `empenhar/liquidar/pagar/registrarArrecadacao` exigem um
`roteiro: RoteiroContabil` e **nenhum código de produção montava um** — `ContaPcasp`
nascia em 55 arquivos, todos de teste, e `resolverContas` é fail-closed. A 7.2 resolveu
as duas pontas: os roteiros oficiais em `modules/m01-core-contabil/roteiros.ts` e o plano
em `prisma/seed/pcasp.ts`.

**A porta ENCAMINHA o roteiro, não o escolhe.** Ela importa do M01 e passa adiante:
escolher contas na borda seria pôr contabilidade na camada de pixel.

**A cadeia:** Server Action → `comEscritaAutenticada(ação do censo)` → exige sessão,
injeta o `criadoPor` real e grava o `RegistroDeOperacao` → porta → serviço(input,
roteiro do M01, deps) → fato + lançamento pelo funil.

`modules/m16-travamento/m16-borda-execucao.test.ts` prova a cadeia inteira **com o plano
de produção** (`semearPcasp`, o mesmo seed de dev/prod) — não com contas inventadas por
fixture. É esse elo que a 7.1 não tinha.

**Nenhum guard na borda.** Saldo da dotação, categoria obrigatória sem contrato, teto da
liquidação, posição na fila — tudo do domínio, dentro da transação, contra o SUM real. A
tela SUGERE (o saldo da ficha, a posição na fila); o domínio DECIDE. Entre o render e o
submit, outro ato pode ter andado a fila.

**O pagamento chama SÓ o M05**, com `justificativaQuebraOrdem` — nunca o M06 direto.
`m06-ordem-cronologica/ports.ts`: "o M06 não importa o M05. É o `pagar()` do M05 que
chama `validarOrdemCronologica` — dentro da transação dele". É isso que faz a
justificativa e o pagamento serem atômicos.

## 6. Pendências NOMEADAS

| Pendência | O que falta | Onde |
|---|---|---|
| ~~**7.2-roteiro-pcasp**~~ | ✅ **quitada na 7.2** (roteiros no M01, plano no seed) — e as escritas religadas na 7.3 | §5 |
| **LIQUIDACAO-MATERIAL-ALMOXARIFADO** | liquidar material (elemento 30) recusa na porta. O rol do M01 manda material para o ESTOQUE — e está certo, material vira ativo. Mas a entrada no almoxarifado é ato do M10 (classe, quantidade), e liquidar sem ela deixaria estoque no razão que movimento nenhum explica: a amarração razão × almoxarifado acusaria para sempre. Os dois são **um** ato, e ele é do domínio — não dá para montá-lo na borda empilhando duas chamadas (se a 2ª falha, a 1ª já gravou). | `lib/portas/liquidacao.ts` |
| **MAPA-NATUREZA-CONTA** | a VPA da arrecadação depende da natureza da receita, e o plano mínimo tem uma só (`4.1.1.2.1.01.00`). Irmã do MAPA-ELEMENTO-CONTA; o xlsx PCASP Estendido fecha. | `lib/portas/arrecadacao.ts` |
| **liquidoDoFato-anulacao-total** | `packages/estornaveis.liquidoDoFato` **não zera** um fato anulado TOTALMENTE (o filtro dele descarta a linha do estorno), embora o docstring prometa. Zero chamadores e nenhum teste antes desta fatia. Contornado localmente por `liquidoDeUmFato` (mesmo `somaLiquidaEstornaveis`, recorte certo). | `modules/m05-despesa/consultas.ts` |
| **5.21.2–5.21.4** | NF **eletrônica** (chave, validação, consulta). Os campos simples de NF já existem no domínio. | — |
| **5.21.6-data-atesto** | `responsavelAtesto` existe e é obrigatório; **data do atesto não existe** no `model Liquidacao`. Coluna nova = decisão de domínio. | `lib/portas/liquidacao.ts` |
| **5.18** | subempenho | — |
| **5.9** | reforço de empenho | — |
| **4.45–4.46** | solicitação de empenho | — |
| **4.61** | anulação de receita (ato próprio, guia própria) | — |
| **`data` × `dataArrecadacao`** | M05 nomeia a data genericamente (`data`, por ato); M04 a nomeia pelo fato (`dataArrecadacao`). Divergência de **nome**, não de semântica — as duas são a data do FATO. Registrado, sem mexer. | — |
| ~~**integração-contexto-real**~~ | ✅ **quitada**: `lib/portas/contexto.ts` lê exercícios e UGs do banco, contra `PermissaoDePerfil`, fail-closed (sem permissão = lista vazia, nunca "todas"); `app/(areas)/layout.tsx` injeta o resultado no `UiContext`. Esta linha dizia "mock" depois de o mock ter saído. | `lib/portas/contexto.ts` |
| **CONTA-PASSIVO-CONSIGNACAO-UI** | `TipoConsignacao.contaPassivoId` entrou no schema e é o que libera a retenção na tela — mas **não há cadastro de tipos de consignação na interface**. Hoje a conta se parametriza por seed (`npm run seed:m07`). A tela de pagamento já mostra o tipo sem conta DESABILITADO, dizendo o motivo, em vez de escondê-lo. | `prisma/seed/m07-tipos-consignacao.ts` |
| **dashboard-portas** | alguns cards do painel ainda são mock | — |

### O que NÃO é pendência (e por que)

- **A arrecadação não filtra por UG.** A receita é do ENTE (CF art. 167, IV): `ReceitaArrecadada`
  tem natureza e fonte, e **não tem** unidade orçamentária. Filtrar receita por UG ensinaria um
  conceito que a Constituição não tem. O seletor de unidade não afeta `/receita/arrecadacoes`.
- **A fila do art. 141 não filtra por UG nem por exercício.** A ordem é por **fonte × categoria**:
  recortá-la por unidade a partiria em filas que a lei não criou, cada pedaço com uma "posição 1"
  própria. O seletor não afeta `/despesa/pagamentos`.
- ~~**O credor não é um select.**~~ **Deixou de valer no ENT01.** O M19 criou o cadastro
  (`Pessoa`, append-only, com papéis). `Empenho.credorCpfCnpj` continua STRING de propósito — o
  fato guarda o documento como ele foi informado no ato, e uma FK apontaria para um cadastro que
  muda depois. A ligação é o DOCUMENTO, indexado dos dois lados. **Pendência `CREDOR-NO-EMPENHO`:**
  o formulário de empenho ainda pede o documento digitado; oferecer o cadastro como sugestão (sem
  torná-lo obrigatório, porque a base tem empenhos de credores não cadastrados) é trabalho do lote
  que mexer naquela tela.
- **A categoria da ordem cronológica é obrigatória no empenho sem contrato.** O `superRefine` do
  `zEmpenharInput` recusa sem ela: um default a faria virar `FORNECIMENTO_BENS` em silêncio.

## 7. ⚠️ Decisões de toolchain (não-óbvias, ficam registradas)

### Dois `tsconfig`, porque NodeNext e bundler não convivem

O backend (`packages/**`, `modules/**`) é `module: NodeNext`, sem JSX/DOM —
**`tsconfig.backend.json`**, e é o que `npm run typecheck` usa. O app é `moduleResolution: bundler`
+ JSX + DOM — `tsconfig.json` raiz (Next é dono dele). São incompatíveis num só arquivo.
`npm run typecheck:app` roda o do app. Os dois ficam 0.

### Imports relativos na UI (o alias `@/` conflita com o webpack)

O alias `@/*` **não resolve** no webpack deste setup. A UI usa **import relativo**
(`../../lib/...`). O alias foi removido do tsconfig para o `tsc` não aceitar o que o webpack
recusa — tsc e build enxergam o mesmo.

### TypeScript 5.8.2 (estável), forçado pelo Next

O repo usava `typescript@^7.0.2` (o port nativo experimental). O Next 15 exige TypeScript 5.x e
auto-instalou 5.8.2. É uma **estabilização**: o backend `tsc` segue 0, os testes (via
vitest/esbuild) não dependem da versão do tsc, e nenhuma linha de domínio mudou.

## 8. Estrutura

```
app/
  layout.tsx              root pelado (sem shell)
  login/                  fora do grupo de áreas — sem shell
  (areas)/
    layout.tsx            ⚠️ a FRONTEIRA de sessão: valida ou redireciona a /login
    page.tsx              dashboard
    despesa/{empenhos,liquidacoes,pagamentos}/     ← 7.1 (consulta)
    receita/arrecadacoes/                          ← 7.1 (consulta)
    planejamento/reprevisao/                       ← escrita
    administracao/{usuarios,perfis,senha,auditoria}/
    relatorios/{rreo,rgf,livros}/
components/ui/            Card, PageHeader, Badge, EstadoVazio, TabelaDeDados,
                          ValorMonetario, Sidebar, Header, Breadcrumb, Footer,
                          Seletores, SincronizarContexto, RelatoriosRelacionados
lib/
  portas/                 ⚠️ a ÚNICA borda com o domínio (ver §2)
  design/tokens.ts        tokens tipados        ·  format/moeda.ts   formatarMoeda (pura)
  navegacao.ts            mapa de áreas (fonte única da sidebar e das landings)
  recorte.ts              exercício/UG lidos da URL (fonte única das 4 telas)
  ui-context.tsx          contexto exercício/UG (interface tipada, dado mock)
middleware.ts             SÓ expõe x-pathname (sem banco)
```

`@media print` esconde `[data-chrome]` (sidebar/header/footer) — o relatório em papel é só o
conteúdo. O PDF de verdade é o 7.5.

## 9. Tokens — CSS variables, num lugar só

A fonte da verdade das cores é o `@theme` de `app/globals.css` (Tailwind v4, CSS-first).
`lib/design/tokens.ts` é o espelho **tipado** para o TS. **Nenhum componente escreve hex solto**.
Paleta: cinzas frios + azul institucional (ação/nav) + verde/vermelho **só** para sinal contábil —
o `Badge` de status usa tons sóbrios, nunca o verde/vermelho do valor.

## 10. Máscaras BR — apresentação, e só (7.9)

`components/ui/Campos.tsx` (ilha client): **`CampoValor`**, **`CampoCpfCnpj`**,
**`CampoTelefone`**, **`CampoCep`**. As funções puras estão em `lib/format/mascaras.ts` —
`moeda.ts` é a SAÍDA (domínio → tela), `mascaras.ts` é a ENTRADA (tela → domínio), e
`desmascararValor` é a inversa de `formatarMoeda` (provado com ida-e-volta no teste). A exibição
do `CampoValor` **reusa `formatarMoeda`**: o número no input e o número na tabela são formatados
pelo mesmo código, porque duas formatações de dinheiro divergiriam.

### O padrão: dois inputs, e é ele que impede a máscara de vazar

- o **visível**, mascarado, **sem `name`** → o usuário lê e digita; não é submetido (o browser só
  submete controle com `name`). É onde vive o `required`: sem `name` ele ainda é validado.
- o **hidden**, **com o `name`**, carregando o **valor cru** → é este que entra no `FormData`.

**Nenhuma Server Action e nenhuma porta mudaram na 7.9** — o `empenharAction` continua lendo
`String(formData.get("valor"))` e recebendo `"1234.56"`. O diff vazio das actions é a prova de que
a fronteira UI→porta não se mexeu; o grep trivalente (§1) segue valendo sem exceção.

⚠️ **Submeter só dígitos no CPF/CNPJ é integridade, não estética.** O M13 distingue PF de PJ pelo
**comprimento** (11 × 14) e chama "um CPF com pontuação que ninguém normalizou" de DADO QUEBRADO.
`123.456.789-01` tem 14 caracteres — se a máscara vazasse, seria lido como CNPJ.

⚠️ **O `CampoValor` não reformata a cada tecla, e isso é decisão de segurança.** O acumulador de
centavos (em que `10000` vira `100,00`) é o padrão de fintech BR e aqui seria um erro de 100× num
empenho. Ele formata no **blur** e aceita `10000`, `10000.00`, `10.000,00` e `10000,00` — todos
viram `10000.00`. A regra que desambigua o ponto (3 dígitos depois = milhar; 1-2 = decimal) está
em `desmascararValor` e é a parte testada com mais cuidado da frente.

⚠️ **A máscara não valida.** "A tela SUGERE; o domínio DECIDE" (§4): o que ela não entende ela
entrega **cru** ao domínio, que recusa nomeando. Máscara que valida vira um segundo domínio, mal
escrito e sem teste. Por isso o `minLength={11}` saiu do credor no `FormEmpenho`: ele contava
caracteres do que se digita, e com máscara nunca mais dispararia — guard morto fingindo guardar.

### As datas continuam `<input type="date">`

`type="date"` **já** exibe dd/mm/aaaa em navegador pt-BR e submete ISO `yyyy-mm-dd`, que é o que as
quatro actions consomem (`${dataBruta}T12:00:00Z`). Uma máscara textual custaria o calendário e a
validação nativos e obrigaria a reescrever as actions **para ganhar o formato que o navegador já
dá**. Não há `CampoData`, de propósito.

### Pendência: `CampoTelefone` e `CampoCep` sem consumidor

Nenhum form tem campo de telefone ou CEP hoje (a 7.9 procurou: zero ocorrências em `app/`,
`components/`, `lib/`). Os dois existem porque a diretriz de máscaras os pediu e ficam testados
para o cadastro de credor/fornecedor. Registrado aqui para que quem os encontrar saiba que a
ausência de uso é conhecida, não abandono.

### ⚠️ O gate monetário é RESTRITO ao caminho de valor — e o motivo é atrito

Um `rg -n "parseFloat|Number\(|toFixed" components/ui/` global **não volta vazio**, e o hit é
legítimo: `Seletores.tsx:24` faz `Number(e.target.value)` no seletor de **exercício**. Ano é
inteiro, não dinheiro. Quantidade e dias também.

Um gate global transformaria isso em ruído permanente — e gate que grita sem motivo é gate que
alguém desliga. A regra é: **o gate mira o caminho de VALOR, não o arquivo inteiro.**

E a defesa que de fato segura é **teste, não regex**. Regex pega a FORMA (`parseFloat` escrito);
teste pega o EFEITO (precisão perdida). O caminho monetário tem de ter um teste que passe `"0.1"` e
`"0.2"` pelo `CampoValor` e confirme que a soma via `Decimal` dá exatamente `"0.30"` — se alguém
introduzir coerção numérica no meio, ele morre. Um teste não some por atrito; um gate de lint some.

⚠️ E **allowlist não serve**: ela cresce, ninguém revisa as entradas antigas, e em seis meses é
carimbo. Restringir o alvo é manutenção zero; manter uma lista de exceções é manutenção eterna.

## 11. ⚠️ Teste de COMPONENTE — o DOM entrou na 7.9 (e por quê)

Até a 7.9 a UI se testava **sem React** (`test/ui/moeda.test.ts`), e o padrão continua valendo:
`mascaras.test.ts` prova a REGRA sem DOM nenhum. O que função pura **não** alcança é a FIAÇÃO —
se alguém puser o `name` no input visível, a tela continua certa e o domínio passa a receber
`"1.234,56"`. Só um `FormData` de verdade prova o contrário; `test/ui/Campos.test.tsx` faz isso.

Três decisões, todas com armadilha registrada:

- **`environment` por ARQUIVO**, não global: o docblock `// @vitest-environment happy-dom` no topo
  do teste. O default da suíte segue `node` — quase tudo é domínio + Prisma e um DOM global
  custaria a todos por causa de poucos.
- **`test/**/*.test.tsx` no `include`**: sem essa linha o arquivo seria **silenciosamente
  ignorado** e a suíte passaria verde sem nunca o ter executado — a armadilha que o `global-setup`
  recusa ao não pular teste de banco.
- **`oxc: { jsx: { runtime: "automatic" } }`** no `vitest.config.ts`: o Vite 8 transforma com
  **oxc**, que lê o `tsconfig.json` do app e obedece ao `"jsx": "preserve"` (correto para o Next,
  que transforma depois — mas no teste não há Next, e o JSX chega cru ao parser). A chave `esbuild`
  está deprecada e é **ignorada em silêncio** quando o oxc decide. Não se usa
  `@vitejs/plugin-react`: ele serve a fast-refresh/HMR, que teste não tem.

⚠️ **Teste de DOM também sobe o Postgres**, porque o `globalSetup` é da suíte inteira. É custo
aceito, não descuido.

⚠️ **`label.control`, não `getByLabelText`.** Os dois discordam sobre o `CampoValor` e o DOM é quem
tem razão: o testing-library varre qualquer form element dentro do `<label>` e acha **dois**
(visível + hidden); a especificação diz que `input[type=hidden]` **não é labelable**, então o
`control` de verdade — o que o browser foca ao clicar no rótulo — é o visível. Testar pelo
`control` é testar o browser; testar pelo query seria testar a biblioteca.

## 12. Anulações (TR 5.35 / 4.61) — a escrita da correção (7.12)

Cada tela de execução ganhou a ação **Anular** por linha, num `<details>` compacto (`FormAnular`
para despesa; `FormAnularReceita` para receita). A porta `lib/portas/anulacao.ts` encaminha ao
serviço — **o estorno nasce no domínio, jamais na borda**.

- **Empenho/Liquidação/Pagamento** (`anularExecucao`): o form tem valor (máscara BR, default = saldo
  anulável), motivo (mín. 10) e data. A action decide **total × parcial** por uma regra mecânica —
  `total` quando o valor esgota o saldo E o nível de baixo está vazio (`estornavel`); senão parcial.
  Os campos ocultos `estornavel`/`anulavelSaldo` só ESCOLHEM o serviço; o domínio revalida cada um
  (um estorno total de empenho já liquidado deixa a liquidação órfã → o serviço recusa). A retenção
  que proíbe a parcial de pagamento sobe como mensagem do domínio, apontando o caminho (anular
  inteiro). O pagamento ganhou leitor próprio (`listarPagamentos`, M05): a fila mostra o que falta
  pagar; a anulação pergunta o que já saiu.
- **Arrecadação** (`anularReceita`): **total apenas** — o serviço do M04 não tem parcial. Só a guia
  de anulação e a data; a cascata (dívida ativa, operação de crédito) é do domínio.

Borda testada (`m16-borda-anulacao.test.ts`, o desenho da 7.3): sem sessão o token forjado não
valida; a parcial acima do saldo é recusada pelo domínio e a mensagem atravessa; a operação fica
auditada com o `criadoPor` da sessão.

## 13. ⚠️ ADMINISTRAÇÃO DE USUÁRIOS — F3/F4 PARARAM NO PASSO 0 (7.12)

A 7.12 quis dar telas de **criar usuário**, **conceder/revogar perfil**, **ativar/inativar** e
**reset de senha por admin (TR 4.55)**. O Passo 0 achou que **o domínio não tem esses atos** — e
esta camada **não cria usuário por INSERT de borda**. Ficam nomeadas, para uma sessão de DOMÍNIO:

| Pendência | O que falta no domínio | Achado do Passo 0 |
|---|---|---|
| **CRIAR-USUARIO** | serviço de criar usuário fora do `bootstrap` (que aborta com `count>0`) + ação de censo | só o bootstrap cria `Usuario`; o resto é fixture de teste |
| **CONCEDER/REVOGAR-PERFIL** | serviço de `VinculoUsuarioPerfil` como ato auditado + ação de censo | hoje é linha crua, só tocada em teste |
| **ATIVAR/INATIVAR-USUARIO** | serviço que escreve `Usuario.ativo` + ação de censo | `ativo` é coluna, só um teste a vira |
| **4.55-reset-de-senha** | AÇÃO DE CENSO que autorize reset de terceiro | o mecanismo EXISTE (`definirSenha({usuarioId, senha, criadoPor})` aceita alvo e revoga todas as sessões), mas está em `FORA_DO_CENSO` de propósito — uma ação nova cairia por herança no perfil EXECUCAO |

⚠️ A `administracao/usuarios` segue **só leitura** (`listarUsuarios`/`listarPerfis`), e a troca da
PRÓPRIA senha (`trocarPropriaSenha`) continua a única escrita de M16 na borda. Criar a ação de
censo de reset e os serviços de usuário é decisão de DESENHO do domínio (o autor decide como o
perfil de quem administra usuários se separa do de quem executa despesa) — não se improvisa na UI.

**Atualização 7.14 — QUITADO.** A pendência `AUTORIZACAO-ADMIN-SEM-CENSO` foi fechada: a 7.14 pôs
os 6 valores no enum `AcaoDoSistema` (migração aditiva separada), moveu os serviços para o censo
(`autorizar` em cada um, família `ADMINISTRACAO`) e escreveu o teste de não-herança. Com a
fechadura no lugar, a **borda saiu**: `administracao/usuarios` agora cria usuário (senha inicial
exibida UMA vez no resultado, nunca logada), concede/revoga perfil, ativa/inativa e reseta senha —
tudo `comEscritaAutenticada` com as ações novas. Um executor que tentasse resetar senha alheia é
NEGADO pelo domínio, e a tela não o esconde. ⚠️ Segue nomeada só a **troca-obrigatória no primeiro
acesso** (campo de schema, fora da exceção da 7.14) — o interruptor da página a declara. Ver
`modules/m16-travamento/MODULO.md#7.14`.
