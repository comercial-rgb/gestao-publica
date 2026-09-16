# M11 — Licitações e Contratos (Lei 14.133/2021)

TR 5.96, 5.97, 5.115, 5.117, 5.119.

## O que este bloco (1) entrega

Cadastros e movimentos. **Nenhuma integração com M05/M06** — é o bloco 2.

- `ProcessoLicitatorio` — rol de modalidades **fechado** (art. 28 + arts. 74/75).
- `Contrato` — `processoId` **obrigatório** (dispensa e inexigibilidade são
  modalidades, não a ausência de processo) e `categoriaOrdemCronologica` **reusada**
  do M06 (é daqui que o bloco 2 fará o empenho herdar a categoria).
- `MovimentoContratual` — append-only, com os **6 tipos desde o dia 1** (3 aditivos
  + 3 estornos). Feature sem estorno é assimetria com prazo para virar bug (345af7d).

## Estado é DERIVADO — nunca coluna

| Estado | Como sai |
|---|---|
| valor atual do contrato | `valorInicial + Σ(valor × SINAL_VALOR_CONTRATUAL)` |
| fim da vigência | `vigenciaFimInicial + Σ(dias × SINAL_PRAZO_CONTRATUAL)` dias |
| processo homologado? | `dataHomologacao != null` |
| já estornado? | `estornos.length > 0` |

**Duas dimensões, um movimento.** Cada tipo é **neutro (0)** na dimensão que não é
a dele — senão um `PRORROGACAO_PRAZO` de 90 somaria 90 reais ao contrato. O `CHECK`
(`prisma/sql/ck_movimento_contratual_xor.sql`) diz a mesma coisa em SQL, e pega o
INSERT direto que dribla o Zod.

## O que o bloco 2 entrega (integração M05/M06)

- **`Empenho.contratoId`** (FK nullable) e **`ReservaDotacao.processoId`** (FK
  nullable) — as duas dimensões que faltavam. A **anulação COPIA o `contratoId`**:
  sem isso a soma do empenhado veria o empenho e não veria a anulação dele, e o
  contrato ficaria empenhado para sempre.
- **`HomologacaoProcesso`** — a homologação virou **evento append-only**. A tensão
  declarada no bloco 1 (homologar depois exigiria UPDATE) foi resolvida do jeito de
  sempre: **o fato virou linha**. As duas fontes (cadastro × evento) **nunca
  convivem** — `homologarProcesso()` recusa processo que já trouxe a data no
  cadastro, e a leitura passa por **uma** função (`homologadoEm`).
- **`ReservaDotacao.licitacaoId` FOI DROPADA** (migration destrutiva, manual e
  isolada). Era string sem FK, **escrita e nunca lida**; zero linhas com valor;
  pré-produção. O vínculo de verdade é o `processoId`.
- **Herança de categoria (art. 141)**: o empenho **herda** a categoria do contrato.
  Se o chamador informar uma **divergente**, é **erro nomeado** — nunca sobrescrita
  em silêncio (colocaria o pagamento na fila errada e esconderia o erro de quem
  digitou).

### A inversão de dependência (e por que ela é obrigatória)

O M11 precisa do M05 (o empenhado sai do `Empenho`) **e** o M05 precisa do M11
(vigência e saldo bloqueiam). Import nos dois sentidos seria **ciclo**. O M05 declara
`ContratoPort` (o que ele precisa saber) e o M11 implementa (`adapter-m05.ts`) — o
único ponto do repositório onde os dois se encontram. `criarM05Deps()` segue sem
saber o que é contrato; quem empenha com contrato usa `criarM05DepsComContratos()`.
**Fail-closed**: empenhar COM contrato sem o port ligado **falha** (t9) — nunca
"passa batido".

### ~~Janela declarada~~ ✅ FECHADA NO BLOCO 3

O `ContratoPort` passou a **receber a `tx` do empenho**, e a implementação **trava a
linha do contrato** (`SELECT ... FOR UPDATE`) **antes** de somar o empenhado. Dois
empenhos concorrentes: o segundo espera o primeiro commitar, relê o empenhado já com
ele dentro, e é rejeitado. O t1 roda 5 rodadas de `Promise.allSettled` e exige
**exatamente um** gravado.

⚠️ **O QUE ISSO REVELOU — e é um achado, não uma vitória.** Não havia mecanismo de
concorrência **nenhum** para reusar: o guard do saldo da **ficha** (`exigirSaldo`)
também soma dentro da `tx` **sem lock**, e sob READ COMMITTED dois empenhos
concorrentes contra a **mesma ficha** leem o mesmo disponível e **os dois passam**.
A ficha tem a **mesma corrida** que o contrato tinha — só que ninguém a declarou.
É pendência **do M05**, e o remédio é o mesmo (`FOR UPDATE` na ficha antes de somar).

## Bloco 3 — limites, vínculo de aquisição e relatório

- **`LimiteContratacao`** (TR 5.106): append-only; o vigente numa data é o de **maior
  `vigenciaInicio` <= data**. Decreto novo = linha nova, e o contrato de 2026 continua
  julgado pelo limite de 2026. Dado oficial em
  `prisma/seed/dados/limites-contratacao.ts` (Decreto 12.807/2025).
- **O teto é ESTRITO**: o art. 75 autoriza "valores **inferiores a**". Um contrato
  **igual** ao teto **não** está dispensado (`>=` reprova).
- **Teto real = MIN(oficial, controle interno)**. O ente pode se autolimitar abaixo da
  lei, nunca acima — o Zod barra o inverso.
- **`hipoteseDispensa` mora no PROCESSO, não no Contrato** — e não por gosto: um
  `CHECK` do Postgres **não atravessa tabelas**, e `modalidade` é do processo.
  Pendurada no contrato, a bicondicional "DISPENSA ⟺ hipótese" seria **inexequível no
  banco**. É também onde ela pertence: quem dispensa a licitação é o processo.
- **TR 4.49/5.15**: empenho de **capital com contrato** exige `classeDeBensId`
  (derivação `ehGrupoDeCapital` **reusada** do M10 — grupo 6 nunca exige: capital sem
  bem). E o `adquirirBem` **recusa** incorporar em classe diferente da que o empenho
  prometeu.
- **Relatório 5.103** com **L1/L2/L3**. O `saldoDaLicitacao` **pode ser negativo** (sem
  clamp): contratar acima do licitado acontece, e é justamente o achado.

### Pendências declaradas (bloco 3)

- **TR 4.48 e 4.50 NÃO implementadas**: exigem entidades que **não existem** (módulos
  de **dívida pública** e de **obras/medições**). Sem a fonte-de-verdade não se valida
  — inventá-la seria pior do que não ter.
- **Art. 125 (25%/50%)** segue fora (ver acima) — o do art. 75 é outro limite e este
  sim está implementado.
- **Empenho de capital SEM contrato** não exige classe: o escopo do TR é a cadeia
  licitatória. Uma aquisição fora de contrato (doação, dação) não passa pelo guard.
- **Concorrência da FICHA** (acima): pendência do M05.

### Anulação de empenho é TOTAL

`zAnularEmpenhoInput` não tem campo `valor`, e o estorno copia o valor do original.
**Não existe anulação parcial** neste sistema — quem precisa reduzir um empenho anula
e reempenha o resto. (O t3 prova a devolução com anulação total.)

## Passo 0 — o que o schema já tinha (e o que NÃO tinha)

- **Nada de licitação/contrato existia.** Único vestígio: `ReservaDotacao.licitacaoId
  String?` — uma **string solta, sem FK**, com o comentário *"vínculo futuro com o
  módulo de licitações (M11)"*. **Não foi usada**: ligar o saldo do contrato a uma
  string cuja semântica ninguém escreveu seria adivinhar. O bloco 2 decide se ela
  vira FK ou morre.
- **`Empenho` NÃO tem vínculo a processo/contrato** — só `fichaId`, `subelementoId` e
  a `ReservaEmpenho`. O bloco 2 precisa da coluna (aditiva).
- **Empenho de REFORÇO (TR 5.9) não existe**: `TipoEmpenho` é
  `ORDINARIO | GLOBAL | ESTIMATIVO`, e não há `empenhoOriginalId`. Não foi inventado
  aqui — é dado do M05.

## Pendências DECLARADAS (nenhuma meia-regra de memória)

- **Limites do art. 125 (25% / 50%) NÃO são validados.** O limite tem exceções (o §
  do próprio artigo; o acordo das partes na supressão) e a base de cálculo é o valor
  inicial **atualizado por reajuste** — que este módulo ainda não modela. Uma
  meia-regra barraria aditivo legítimo e deixaria passar o ilegal com a mesma
  convicção. Entra quando a regra vier inteira.
- ~~**`empenhadoLiquidoDoContrato` é soma sobre conjunto vazio**~~ ✅ **PAGO NO BLOCO
  2.** A função nasceu com a **forma final**, e a dívida custou **uma linha**: o corpo
  passou a delegar para `empenhadoLiquidoPorContrato` (M05), e **nenhum chamador
  mudou**. O guard da supressão, que já a chamava, passou a morder sozinho (t5).
- ~~**Homologar DEPOIS do cadastro exigiria um UPDATE**~~ ✅ **RESOLVIDO NO BLOCO 2**:
  `HomologacaoProcesso`, o fato como linha.
- **Sem guard `valorInicial <= valorLicitado`, e é de propósito**: o contrato sai do
  **lance**, que quase sempre vem abaixo da estimativa. A relação entre licitado e
  contratado é assunto de **relatório** (TR 5.103 compara os dois), não de bloqueio.
- **Reajuste/repactuação e rescisão** não existem neste bloco.

## Telas (sessão noturna V4, §8 — Fila A)

O processo e o contrato ganharam superfície pelo **molde** (`lib/portas/recursos/contratacao.ts`,
`contratacao-dados.ts`; rotas `/licitacoes/processos` e `/licitacoes/contratos`). O processo se
cadastra na listagem; homologar, reservar dotação (vinculada ao processo), liberar reserva e
cadastrar o contrato são AÇÕES do detalhe. O contrato entra pelo processo homologado; aditivo e
estorno de aditivo são ações do detalhe do contrato. Situação, valor atualizado e fim da vigência
continuam DERIVADOS pelas funções deste módulo — a porta não soma. As opções contextuais (a reserva
a liberar, o aditivo a estornar) são só as do registro aberto, e o servidor confere a pertença.

O **empenho** passou a oferecer o contrato (de processo homologado e vigente) e a reserva viva como
selects opcionais, e a porta do empenho liga o M05 com `criarM05DepsComContratos` — antes, qualquer
`contratoId` seria recusado ("módulo de contratos não foi ligado"). A TR 4.42 continua sendo
decidida pelo M05 na transação. Percurso: `scripts/smoke-contratacao.ts`.

### Pendências nomeadas pela Fila A

- ~~`COMPRAS-COM-ITENS-NA-TELA`~~ — **fechada (743b857):** solicitação, pesquisa de preços e ordem de
  compra têm tela; a criação é de ilhas com linhas de item (`itens.N.*`), o recebimento é ilha no
  detalhe da ordem, a lista e as ações são do molde (`lib/portas/recursos/compras.ts`,
  `compras-dados.ts`; `scripts/smoke-compras.ts` 20/20).
- ~~`EMPENHO-A-PARTIR-DA-ORDEM`~~ — **fechada (V5):** `Empenho.ordemDeCompraId`; a anulação copia
  a FK; ordinária empenha o total da ordem; global/estimativa o residual. Estorno da ordem recusa
  empenho vivo. Tela: select na emissão do empenho e "Empenhar esta ordem" no detalhe.
- ~~`SOLICITACAO-SEM-VINCULO-COM-A-ORDEM`~~ — **fechada (V6 P1.1, `cd70495`):** `AlocacaoDeSolicitacaoNaOrdem`
  liga uma quantidade de um item da solicitação a um item da ordem (N para N, por item). Ordenado,
  recebido (atribuído por ordem de alocação), cancelado e pendente são DERIVADOS
  (`compras-alocacao.ts`). Controles: só AUTORIZADA; material igual; excesso contra o pedido e contra
  a linha; lock advisory no item (N=2); desfazer é linha nova com `estornoDeId`, recusado com
  recebimento atribuído; anular com parcelas vivas recusa; legado sem vínculo é "sem origem" e nunca
  casa sozinho. Telas: atendimento e "formar ordem" na solicitação; origem, "vincular" e "desfazer"
  na ordem; origem no espelho em PDF. `scripts/smoke-solicitacao-ordem.ts` (35 passos).
- **`ESTORNO-DA-ORDEM-E-FATO` (V6 P1.1, decisão que corrige a D12):** `estornarOrdemDeCompra` NÃO
  apaga mais a ordem nem os itens — grava `MovimentoDaOrdemDeCompra` ESTORNO. O `delete` anterior só
  passava em teste porque o teste roda como dono: o papel de runtime (`gestao_app`) não tem DELETE em
  `OrdemDeCompra`/`ItemDeOrdemDeCompra`, e a tela recusaria com "permission denied" no município.
  "Estornada" é `ordemEstornada()`; cada leitor a exclui: empenho (M05), documento fiscal, recebimento,
  vínculo, painel de pendências, opções de empenho/documento, listas (filtro vivas/estornadas). A
  solicitação atendida recebe o movimento informativo `ORDEM_ESTORNADA` (não muda a situação dela).
  Ver `docs/adr/ADR-estorno-da-ordem-como-fato.md`.
- ~~`NOTA-FISCAL-RECEBIDA`~~ — **fechada (V5):** `DocumentoFiscalRecebido` com itens, conferência e
  cancelamento como fatos, importação XML constrita (sem DTD), unicidade por emitente+modelo+série+número
  e chave/hash parciais. Registrar **não** liquida nem dá entrada. Recebimento e liquidação apontam
  para o documento. Telas em `/licitacoes/documentos-fiscais`.
- `EXTRATO-DO-CONTRATO-PDF` — o extrato do contrato em PDF da origem não foi portado.
- Reajuste/repactuação, rescisão e publicações do contrato: continuam fora (ver acima).

## O contrato acompanhado — V7 M2.1 (`fiscalizacao.ts`, `m11-fiscalizacao.prisma`)

**Gestor e fiscal são DESIGNAÇÕES do contrato, não permissões.** `DesignacaoNoContrato` (papel, pessoa e
usuário conferidos pelo vínculo do M16, ato, vigência derivada com `designacaoVigenteEm` da folha) e
`RevogacaoDeDesignacaoNoContrato` (fato). A ação do perfil é condição necessária; o ato de GESTOR exige a
designação de gestor vigente naquele contrato (hoje), o de FISCAL a de fiscal vigente no dia do fato E hoje.
Outro setor com as mesmas ações recebe `SEM-DESIGNACAO-DE-FISCAL`/`-GESTOR`. Quem gere não fiscaliza o
mesmo contrato em período sobreposto (`ACUMULO-DE-GESTOR-E-FISCAL`). Os campos texto antigos
(`fiscalNome/fiscalCpf/fiscalDesignacao`) ficam como carga histórica e não autorizam nada.

- **Itens** (`ItemDoContrato`, `CADASTRAR_ITEM_DO_CONTRATO`): quantidade e unitário em Decimal; a soma não
  passa do valor vigente (`ITENS-ACIMA-DO-CONTRATO`).
- **Agenda** (`OrdemDeFiscalizacao`, `PROGRAMAR_FISCALIZACAO_DO_CONTRATO`): gestor vigente programa para um
  fiscal DESTE contrato vigente na data; contrato vigente na data prevista.
- **Ocorrência** (`OcorrenciaDeFiscalizacao`, `REGISTRAR_OCORRENCIA_DE_FISCALIZACAO`): fiscal vigente, data
  não futura, contrato vigente no dia, ordem deste contrato e deste fiscal; evidências pelo M22 na mesma
  transação (`Anexo.ocorrenciaDeFiscalizacaoId`; leitura pelo alcance da FISCALIZAÇÃO desde V7 M2 U0.1); encaminhamento ao gestor.
- **Resolução** (`ResolucaoDeOcorrencia`, `RESOLVER_OCORRENCIA_DE_FISCALIZACAO`): gestor vigente, só
  ocorrência encaminhada, uma por ocorrência.
- **Medição por itens** (`MedicaoPorItens`/`ItemMedido`, `REGISTRAR_MEDICAO_DE_OBRA`): fiscal vigente;
  contrato vigente no início e no fim do período; valor = Σ quantidade × unitário (centavos por item); por
  item o acumulado não passa do contratado (`ITEM-ACIMA-DO-CONTRATADO`, sob o trinco do contrato — duas
  simultâneas, uma recusa); no conjunto, os guards de sempre em `gravarMedicaoNaTransacao` (o mesmo corpo
  de `registrarMedicao`). A aprovação continua sendo de OUTRA pessoa, e só ela libera a liquidação.
- **Físico não é financeiro.** `acompanhamentoDoContrato` mostra lado a lado e separados o físico por item
  (medido, a medir, %) e o financeiro do M05 (empenhado líquido, liquidado, pago).
- **Projeção pública** (`projecaoPublicaDoContrato`, `/transparencia/contratos/[id]`): identificação,
  vigência derivada, valores, aditivos, responsáveis VIGENTES por nome e ato, execução física das medições
  APROVADAS. Sem ocorrência, evidência, agenda, conta ou documento de pessoa.

Telas: dossiê abaixo dos dados em `/licitacoes/contratos/[id]` (formulários só a quem pode; motivo a quem
não é designado), `/transparencia/contratos`. Permissões v18 (designar e cadastrar item ao administrador;
os atos de gestor e fiscal não são derivados). Testes: `test/contrato-acompanhado.test.ts` (N=2 itens,
contrato vigente e vencido, outro setor, concorrência, revogação, projeção pública). Percurso
`scripts/smoke-contrato-acompanhado.ts`.

Pendências: `ADITIVO-POR-ITEM` (acréscimo/supressão de quantidade de item), `ORDEM-DE-SERVICO-DO-CONTRATO`
(ordem de início/fornecimento ao contratado), `MEDICAO-POR-ITENS-SEM-OBRA` (a medição é de obra; serviço
contínuo sem obra ainda não mede por itens), `PRAZO-DE-RESOLUCAO-DA-OCORRENCIA`, `NOTIFICACAO-AO-CONTRATADO`,
`RECEBIMENTO-PROVISORIO-E-DEFINITIVO`.

## A ponte contratual — V7 M2 (`docs/lotes/V7-M2-execucao-contratual.md`)

### U0.1 — quem alcança o contrato (`acesso-da-fiscalizacao.ts`)

Três projeções, e uma não herda a regra da outra (`decidirAlcance`, pura; `alcanceNoContrato` lê os fatos):

| Projeção | Quem alcança | O que leva | Onde vale |
|---|---|---|---|
| FISCALIZAÇÃO | designação VIGENTE HOJE no contrato (gestor, fiscal, recebedor definitivo) ou definição vigente de `AdministradorDaFiscalizacao` (5.21.17) | agenda, ocorrências, evidências, conferências e termos | dossiê em `/licitacoes/contratos/[id]`, download da evidência (`entregarAnexo`), lista `/licitacoes/fiscalizacao`, e os atos (que exigem a designação na transação) |
| FINANCEIRA | `CONSULTAR_LICITACOES`, `CONSULTAR_DESPESA`, `EMPENHAR`, `LIQUIDAR` ou `PAGAR` | contrato, itens e saldos, valores medidos/aceitos/liquidados | dossiê (agenda e ocorrências nem são lidas do banco) |
| PÚBLICA | sem sessão | `projecaoPublicaDoContrato`, campo a campo | `/transparencia/contratos/[id]` |

- Permissão global de outra área não é administração da fiscalização (AC02). A ação
  `DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO` dá o poder de DEFINIR, não o alcance: o administrador da plataforma que
  precisa do dossiê define a si mesmo, com ato, e isso fica registrado (AC03).
- Revogação tira o alcance atual; os atos anteriores continuam com autor e designação usada; o sucessor designado vê
  o histórico (o alcance é do contrato, não do autor). Backdating não recupera poder: o ato exige a designação no dia
  do fato E hoje (AC06).
- O detalhe do contrato responde 404 a quem não lê licitações nem alcança a fiscalização daquele contrato.
- `RECEBEDOR_DEFINITIVO` é papel próprio (art. 140, I, b), segregado do FISCAL nos dois sentidos
  (`ACUMULO-DE-FISCAL-E-RECEBEDOR`); com o gestor pode acumular.

Testes: `test/acesso-da-fiscalizacao.test.ts` (AC01–AC04, AC06, segregação; mutações "administrador sem vigência" e
"financeira lendo ocorrências" acusadas). Permissões v19 (`ponte-contratual`).

### U0.2 — a unicidade da medição (`regime-de-medicao.ts`)

**Achado:** a medição por itens recusava qualquer sobreposição de período na obra — regra herdada da medição por
valor — e o percurso passou a procurar "o dia livre". O fundamento declarado ("medir o mesmo intervalo duas vezes é
medir o mesmo serviço duas vezes") só vale quando o período é a única identidade da parcela.

| Situação | Quem decide | Resultado |
|---|---|---|
| mesma chave e mesmo conteúdo (ME01) | envelope da borda (`comOperacaoRegistrada`) | replay, um efeito, também concorrente |
| mesma chave e outro conteúdo (ME02) | envelope | `COMANDO EM CONFLITO` |
| mesma parcela com outra chave (ME03) | saldo por item (contratado; na ordem de serviço, o autorizado) | `ITEM-ACIMA-DO-CONTRATADO` |
| duas parcelas distintas no mesmo dia (ME04) | — | passam; saldo por item correto |
| contrato com período indivisível configurado (ME05) | `RegimeDeMedicaoDoContrato` (regime, fundamento, vigência) | sobreposição recusada citando o fundamento, só naquele contrato |
| medição só por valor | `gravarMedicaoNaTransacao` com `FUNDAMENTO_DA_MEDICAO_POR_VALOR` | período conferido sempre, agora na obra DENTRO do contrato |

Sem configuração, o regime é `PERIODO_LIVRE`: nenhum regime é inventado. A configuração é fato novo
(`CONFIGURAR_EXECUCAO_DO_CONTRATO`), com vigência; a anterior continua valendo antes dela (art. 140, § 3º).

**Achado lateral corrigido:** o teto "Σ das medições ≤ valor vigente do contrato" somava só as medições da OBRA; um
contrato com duas obras media acima do valor vigente. Soma agora o contrato inteiro.

Testes: `test/unicidade-da-medicao.test.ts` (ME01, ME02, ME03 pelo saldo, ME04, ME05, concorrência pela última
unidade, medição por valor); mutações "confere sempre", "ignora o indivisível" e "teto por obra" acusadas. O percurso
`smoke-contrato-acompanhado.ts` deixou de procurar dia livre: mede ontem os itens da própria execução e a segunda
parcela no mesmo dia (3.3b). `ME06` (alteração contratual entre emissão e medição) depende do aditivo por item — não
executado.

### U1/U2 — a ordem de serviço, a medição da ordem e os recebimentos (`ordem-de-servico.ts`)

**Reconciliação.** `OrdemDeCompra` (m11-compras) autoriza fornecimento de MATERIAL, sem contrato; `OrdemDeFiscalizacao`
é a agenda do fiscal; `OrdemDeServicoDoContrato` é a autorização de EXECUÇÃO ao contratado sobre os itens do contrato,
e é o único dos três que compromete o saldo do item do contrato. Nenhum é empenho nem ordem de pagamento.

| Ato | Quem | O que confere | O que NÃO faz |
|---|---|---|---|
| rascunho (`criarRascunhoDeOrdemDeServico`) | gestor designado vigente (`EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO`) | itens do contrato, fiscal vigente do contrato, empenho do contrato não anulado; schema estrito (preço e fornecedor saem do contrato) | não compromete saldo |
| emissão | gestor vigente | contrato vigente hoje, no início autorizado e no fim previsto; saldo por item sob o trinco (ordens emitidas + medição sem ordem); manifesto + sha256 | não reserva, não empenha, não paga |
| descarte / cancelamento de saldo / suspensão e retomada | gestor vigente | rascunho só se descarta; cancelar só o não executado (o medido continua comprometido); marcos alternados, sem data futura | não anula o empenho indicado |
| medição da ordem (`registrarMedicaoDaOrdem`) | fiscal vigente hoje (o sucessor mede) | período dentro do autorizado, fora de suspensão, dentro da vigência na data do fato; acumulado ≤ autorizado; período só se o regime for indivisível | não recebe |
| recebimento provisório | fiscal vigente (art. 140, I, a) | todo item conferido: conforme + controvérsia = medido; controvérsia com motivo; data ≥ fim do período | não aceita em definitivo, não é glosa |
| decisão da controvérsia | recebedor definitivo vigente, ≠ quem recebeu provisoriamente | uma por conferência | ACEITA não recebe; REJEITADA não libera saldo |
| recebimento definitivo | recebedor vigente, ≠ quem mediu e ≠ quem recebeu provisoriamente (art. 140, I, b) | só o elegível (conforme + aceito − recebido); controvérsia pendente bloqueia só o item; pendências no termo | não liquida |

Cenário de referência em `test/ordem-de-servico-e-recebimentos.test.ts`: ordem R$ 1.100,00; medição R$ 1.000,00;
definitivo R$ 900,00; complemento R$ 100,00 (OS01–OS05, ME03/ME04 na ordem, RE01–RE07, AC07; quatro mutações acusadas).
`test/runtime/contrato-runtime-ordem-de-servico.test.ts`: todos os atos pela conexão `gestao_app` e as negativas de
UPDATE/DELETE. AC07 usa uma ordem EMITIDA durante a vigência como carga histórica declarada na fixture.

### U3 — a parcela recebida vira liquidação (`parcelas-da-liquidacao.ts`, `liquidacao-da-parcela.ts`)

Composição, não outra contabilidade: `liquidarParcelasDoContrato` (LIQUIDAR) chama o `liquidar` do M05 com
`parcelasDoContrato`; o adapter confere dentro da transação (ver o MODULO do M05) e grava as alocações no mesmo
commit. Número determinístico por pedido; a retomada acha a liquidação VIVA com as mesmas alocações (LI04); anulada, o
pedido refeito recebe `-2`. Consumido derivado: estorno libera; anulação parcial com várias parcelas não libera
(`ANULACAO-PARCIAL-COM-VARIAS-PARCELAS`). `test/liquidacao-da-parcela.test.ts` (LI01–LI06, ES01/ES02, prova
determinística do trinco do contrato). Achado corrigido no M05: liquidações concorrentes passavam do empenho.

### U4 — telas, documentos e projeção pública

- `/licitacoes/contratos/[id]`: execução por ordens (autorizado, medido, recebido, liquidado, cada um com a definição);
  saldo por item; nova ordem para o gestor.
- `/licitacoes/contratos/[id]/ordens/[ordemId]`: página de trabalho — situação e próximas ações, itens, emissão com
  prévia do efeito, conferência por item, decisão, definitivo, termos em PDF e a preparação da liquidação (documento
  conferido do contratado com saldo, empenho vivo do contrato que não seja de material, prévia da soma).
- `/licitacoes/contratos/[id]/documentos/[tipo]/[id]`: ordem, termo provisório, decisão e termo definitivo impressos do
  MANIFESTO (segunda via idêntica; ente congelado na emissão por `nomeDoEnteNosDocumentos`). Provisório e decisão só na
  visão de fiscalização; 404 fora do alcance. `test/ui/termos-do-contrato.test.ts` (DO01, DO02).
- `/transparencia/contratos/[id]`: ordens emitidas com período, autorizado e recebido em definitivo; sem motivo,
  verificações, termo, conta ou CPF.
- Percurso por papéis: `scripts/smoke-ponte-contratual.ts`, com a preparação declarada `scripts/preparar-ponte-contratual.ts`.

Pendências nomeadas da ponte: `ME06-ADITIVO-ENTRE-EMISSAO-E-MEDICAO` (depende do aditivo por item),
`GLOSA-LIBERACAO-DE-SALDO`, `COMISSAO-COM-QUORUM`, `ORDEM-DE-SERVICO-DE-MATERIAL`, `ANULACAO-PARCIAL-COM-VARIAS-PARCELAS`,
`EMPENHO-POR-PARCELA-DA-ORDEM` (subempenho da parcela), `RETENCOES-NA-LIQUIDACAO-DA-PARCELA` (usa as parametrizadas no
pagamento), `PRAZO-DE-RECEBIMENTO-SEM-CONFIGURACAO`, `PORTAL-DO-FORNECEDOR`, `ASSINATURA-QUALIFICADA-DOS-TERMOS`,
`XLSX-DA-EXECUCAO` (PDF só).

### U5 — o aditivo por itens (`aditivo-por-itens.ts`, `versoes-dos-itens.ts`) — PARCIAL

O termo que muda quantidade e/ou unitário de itens, ou inclui item, a partir de uma vigência. **Não é outro cadastro de
aditivo**: a variação de valor é um `MovimentoContratual` gravado pelo mesmo corpo do `registrarAditivo`
(`gravarAditivoNaTransacao` — supressão abaixo do empenhado e teto da dispensa), na mesma transação, e o valor atualizado,
os relatórios e as remessas continuam lendo só o movimento. As versões (`AlteracaoDeItemPorAditivo`) guardam anterior e
novo; `ItemDoContrato` nunca é reescrito (item incluído nasce com original 0).

| Regra | Onde | Recusa |
|---|---|---|
| variação conferida por item: (Q' − M)·P' − (Q − M)·P, M = medido em períodos inteiramente anteriores à vigência, arredondada uma vez por item | `comporNaTransacao` | `VARIACAO-DO-TERMO-DIVERGENTE` com a composição |
| versão nova só depois da última do item | idem | `VERSAO-POSTERIOR-JA-REGISTRADA` |
| novo unitário não alcança período já medido | idem | `ADITIVO-RETROAGE-SOBRE-MEDICAO` |
| quantidade nova não abaixo do comprometido (ordens emitidas − cancelado + medido sem ordem) | idem | `SUPRESSAO-ABAIXO-DO-COMPROMETIDO` |
| valor do mesmo termo já lançado no cadastro avulso | `registrarAditivoPorItens` | `VALOR-DO-TERMO-JA-REGISTRADO` |
| o valor do aditivo por itens não se estorna avulso | `estornarMovimentoContratual` | `MOVIMENTO-DE-ADITIVO-POR-ITENS` |
| estorno só do último do item e só enquanto nada o usou (ordem criada/emitida, medição) | `estornarAditivoPorItens` | `ADITIVO-JA-UTILIZADO`, `ADITIVO-POSTERIOR-SOBRE-O-ITEM`, `ESTORNO-ABAIXO-DO-EMPENHADO` |

Consumidores das versões (a única leitura do "vigente num dia"): o rascunho da ordem copia o unitário vigente no início
previsto; a emissão recusa rascunho com preço desatualizado (`PRECO-DA-ORDEM-DESATUALIZADO`) e confere o saldo pela MENOR
quantidade de hoje em diante (supressão com vigência futura já limita); a medição da ordem e a medição por itens valoram
pelo unitário do primeiro dia do período e recusam período que atravessa novo preço (`PERIODO-ATRAVESSA-NOVO-PRECO`) — é
o ME06; o cadastro de item soma o original mais as variações dos aditivos vivos; dossiê, execução e projeção pública
mostram original, contratado hoje e unitário hoje, e a lista de termos.

Tela: seção "Aditivos por itens" em `/licitacoes/contratos/[id]` (lista com antes/depois, estorno, formulário com
"Conferir composição" sem gravar e "Registrar aditivo"); `/transparencia/contratos/[id]` mostra as alterações. Teste:
`test/aditivo-por-itens.test.ts` (AD01–AD07). Percurso: `scripts/smoke-aditivo-por-itens.ts` (conta
`contratos-aditivos@percursos.local`). Fora deste incremento: limites do art. 125 (pendência antiga), apostilamento e
reajuste por índice (`REAJUSTE-POR-INDICE`), aditivo que altera o prazo da ordem já emitida, PDF do termo registrado.

### U6 — a planilha orçamentária da obra (`analise-da-planilha.ts`, `planilha-orcamentaria.ts`) — PARCIAL

**Leitura do arquivo** (`packages/planilha`): `.xlsx` por `lerXlsxDetalhado` e `.xls` (Excel 97-2003, contêiner OLE2 +
BIFF8) por `lerXls`, os dois devolvendo por célula o VALOR GRAVADO e a marca de fórmula. Fórmula nunca se executa (vale
o resultado que o arquivo salvou; fórmula sem valor gravado é erro da linha); macro nunca se lê (só é reportada). O
formato é reconhecido pela assinatura do conteúdo, não pela extensão. Recusas nomeadas: não é planilha, Excel 5/95,
protegida por senha, cadeia de setores corrompida. O leitor de `.xls` é testado contra um gravador independente escrito a
partir da especificação (`test/fixtures/planilhas.ts`; `packages/planilha/xls.test.ts`: mini-fluxo, dois setores de FAT,
texto do SST partido entre registros em 8/16 bits, RK ×100, MULRK, fórmula numérica e de texto).

**Análise** (pura): cabeçalho detectado nas primeiras 40 linhas (item, referência, descrição, unidade, quantidade, preço
unitário — preferindo a coluna "com BDI" — e total) ou informado pela pessoa (linha e letras). Hierarquia pelo código
("1.2.3" pertence a "1.2", que precisa vir antes como grupo). Valor do serviço = quantidade × preço unitário, arredondado
uma vez por linha; valor do grupo = soma dos serviços abaixo. **Erros por linha** (bloqueiam): serviço sem unidade,
quantidade ou preço inválidos, mais de 4 casas, código repetido, grupo pai ausente, serviço com subitens, grupo sem
serviço, fórmula sem valor gravado. **Divergências de conciliação** (exigem ciência expressa): total da linha, do grupo
ou total geral do arquivo diferente do calculado — um arquivo que trunca aparece com os dois valores, nada é "corrigido".

**Fatos**: `PreviaDePlanilhaOrcamentaria` guarda o arquivo (bytes, sha256), o mapeamento e a análise. A confirmação
(`confirmarPreviaDePlanilha`) reanalisa OS BYTES e recusa se a análise mudou (`PREVIA-DESATUALIZADA`), com erro
(`PREVIA-COM-ERROS`) ou divergência sem ciência (`DIVERGENCIAS-SEM-CIENCIA`); cria a versão seguinte da obra
(`PlanilhaOrcamentariaDaObra`, única por obra+versão e por prévia), que aponta a anterior e não vale antes dela
(`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE`). A referência de preços e a data-base são as declaradas. O contrato é opcional
(pelo número). `VinculoDeItemDaPlanilhaAoContrato` liga um SERVIÇO a um item do contrato declarado — correspondência
explícita com motivo, revogável por fato; nada é somado, copiado ou identificado entre os dois.

Tela: `/licitacoes/obras/[id]/planilha` (versões, prévias em aberto, importação), `/planilha/previas/[previaId]` (colunas,
linhas, erros, divergências, ignoradas, confirmação com ciência), `/planilha/versoes/[planilhaId]` (itens e vínculos).
Ação `GERIR_PLANILHA_DA_OBRA` (atualização de permissões v20 para quem administra no global). Testes:
`test/planilha-orcamentaria.test.ts` (PL01–PL07; o mesmo orçamento em .xlsx e .xls dá a mesma análise),
`test/runtime/contrato-runtime-planilha.test.ts`. Fora deste incremento: planilha por digitação
(`PLANILHA-POR-DIGITACAO`), arquivo acima de 1 MB pela tela (o corpo das ações do Next; o domínio aceita 5 MB,
`PLANILHA-ACIMA-DE-1-MB-PELA-TELA`), `.ods`, planilha com várias abas somadas, composição analítica (insumos), BDI
diferenciado por item, exportação da versão.

### U7 — a medição da ordem pela planilha da obra (`medicao-pela-planilha.ts`) — PARCIAL

**Não é outra medição.** A quantidade do SERVIÇO da versão aplicável vira a quantidade do item medido da ORDEM
(`gravarMedicaoDaOrdemNaTransacao`, o núcleo extraído de `registrarMedicaoDaOrdem`): autorizado da ordem, vigência,
suspensão, regime de período e unitário do contrato no primeiro dia (ME06) continuam valendo, e o caminho segue igual —
recebimento provisório, decisão, definitivo (U2) e liquidação da parcela pelo M05 (U3).

| Regra | Onde | Recusa |
|---|---|---|
| versão APLICÁVEL: a última com vigência até o primeiro dia; a pessoa escolhe e o servidor confere | `medirOrdemPelaPlanilha` | `VERSAO-NAO-APLICAVEL`, `SEM-VERSAO-VIGENTE-NO-PERIODO` |
| o período não alcança a vigência da versão seguinte | idem | `PERIODO-ATRAVESSA-NOVA-VERSAO` |
| a versão declara o contrato da ordem | idem | `PLANILHA-DE-OUTRO-CONTRATO` |
| conciliação (pura, a mesma da tela): serviço (não grupo), UM vínculo vivo, item do contrato sem outro serviço na versão, MESMA unidade, item autorizado na ordem | `conciliarServico` | `MEDICAO-DE-GRUPO`, `SERVICO-SEM-VINCULO`, `VINCULO-AMBIGUO`, `UNIDADE-NAO-CONCILIADA`, `ITEM-FORA-DA-ORDEM` |
| acumulado do CÓDIGO na obra (todas as versões, sem estornadas) + a medição ≤ previsto da versão | idem | `ACIMA-DO-PREVISTO-NA-PLANILHA` |
| item do contrato com vínculo vivo NÃO se mede avulso | `registrarMedicaoDaOrdem` | `MEDICAO-PELA-PLANILHA` |
| estorno só sem recebimento provisório; a medição estornada não se recebe | `estornarMedicaoDaOrdem`, `registrarRecebimentoProvisorio` | `MEDICAO-COM-RECEBIMENTO` (nomeia provisório, definitivos e se já liquidado), `MEDICAO-JA-ESTORNADA`, `MEDICAO-ESTORNADA` |

**O valor.** O que se recebe e liquida é o do CONTRATO (quantidade × unitário vigente do item). O da planilha é
referência de orçamento e fica ao lado, na memória; nenhum fator (desconto, BDI, reajuste) é calculado entre os dois.
**A memória** (`MedicaoDaOrdemNaPlanilha`, manifesto + sha256, impressa em PDF pelo tipo `memoria`) guarda versão,
data-base e referência de preços, previsto/anterior/atual/acumulado/saldo por serviço, os dois preços, o vínculo usado,
o arredondamento e as evidências — e **nenhuma versão ou aditivo posterior a reescreve**. As evidências são anexos do
M22 (`Anexo.medicaoDaOrdemId`), lidas só pelo alcance da FISCALIZAÇÃO; a memória, também pela FINANCEIRA (lastreia o
valor liquidado); nunca pela projeção pública.

**O estorno da medição** (`EstornoDeMedicaoDaOrdem`) é fato novo: a medição fica no histórico marcada, sai das somas
(a executar na ordem, acumulado da planilha, composição do aditivo) e a quantidade volta a executar.

Telas: formulário "Registrar medição pela planilha da obra" na página da ordem (versão com a vigência, serviço a
serviço com previsto, anterior, esta medição, acumulado e saldo; o serviço que não concilia aparece com o motivo e sem
campo), o estorno da medição, o link da memória e das evidências; "Andamento da obra por serviço" na página da versão
da planilha. Ações: as mesmas `REGISTRAR_MEDICAO_DE_OBRA` (medir e estornar) — nenhuma ação nova no censo.
Testes: `test/medicao-pela-planilha.test.ts` (MP01–MP08: percurso do valor, duas parcelas no mesmo dia, excesso na
planilha e na ordem, conciliação, ME06 com aditivo e nova versão, designação e escopo de UG, concorrência, estorno com
dependente, envelope do comando; cinco mutações acusadas), `test/liquidacao-da-parcela.test.ts` LI07 (900 + 100 pelo
M05), `test/ui/termos-do-contrato.test.ts` DO01/DO02 da memória (70 serviços, multipágina, os dois totais
independentes), `test/runtime/contrato-runtime-ordem-de-servico.test.ts` (medir, evidência e estornar por `gestao_app`,
com as negativas de UPDATE/DELETE). Percurso: `scripts/smoke-medicao-pela-planilha.ts`.
Fora deste incremento: estorno do RECEBIMENTO (`ESTORNO-DE-RECEBIMENTO`), medição por planilha sem ordem de serviço,
conversão de unidades, rateio de um serviço entre itens do contrato, reajuste/BDI entre o preço da planilha e o do
contrato, exportação XLSX da medição.

### U8 — a agenda da fiscalização e os formulários de ocorrência (`agenda-da-fiscalizacao.ts`, `formularios-de-ocorrencia.ts`) — PARCIAL

**A agenda é o mesmo compromisso.** `OrdemDeFiscalizacao` ganhou HORÁRIO ("HH:MM" do relógio do ente), duração e local
(colunas opcionais), e três fatos novos: `ReagendamentoDeFiscalizacao` (motivado; o vigente é o último),
`CancelamentoDeFiscalizacao` e `RealizacaoDeFiscalizacao` (data, horas e relato). A situação é DERIVADA —
PROGRAMADA → REAGENDADA → CANCELADA | REALIZADA, as duas últimas finais — e nada é reescrito.

| Ato | Quem | Recusa |
|---|---|---|
| programar (com horário, duração e local) | gestor designado vigente (`PROGRAMAR_FISCALIZACAO_DO_CONTRATO`) | fiscal de outro contrato, fiscal sem vigência na data, contrato fora de vigência |
| reagendar | gestor designado vigente | `FISCALIZACAO-CANCELADA`, `FISCALIZACAO-JA-REALIZADA`, `FISCAL-SEM-VIGENCIA-NA-DATA` |
| cancelar | gestor designado vigente | `FISCALIZACAO-JA-CANCELADA`, `FISCALIZACAO-JA-REALIZADA` |
| registrar realização | o FISCAL DAQUELE compromisso (`REGISTRAR_OCORRENCIA_DE_FISCALIZACAO`) | `FISCALIZACAO-DE-OUTRO-FISCAL`, `FISCALIZACAO-CANCELADA`, `FISCALIZACAO-JA-REALIZADA`, data futura |

`agendaDaFiscalizacao` é UMA leitura: dia, semana e mês são períodos diferentes dela, em dia civil, com filtros por
contrato, fiscal e situação, e o recorte do servidor (só os contratos que a pessoa alcança; o administrador da
fiscalização alcança todos). **Sobreposição não é proibida**: a agenda APONTA o conflito (mesmo fiscal, mesmo dia,
horários que se cruzam) e quem programa decide — nenhuma norma dá ao sistema essa regra (`CONFLITO-DE-AGENDA-SEM-REGRA`).

**Os tipos de ocorrência são cadastro do ente, versionado.** `TipoDeOcorrenciaDoEnte` (código, nome, natureza
equivalente no vocabulário fixo) com `MudancaDeSituacaoDoTipoDeOcorrencia` (ativar/desativar é fato com motivo) e
`VersaoDoTipoDeOcorrencia` (vigência, exige gravidade, encaminhamento sugerido) com
`PerguntaDoFormularioDeOcorrencia` (texto, número, data, lista de opções, sim/não; obrigatória ou não). A ocorrência
guarda `versaoDoTipoId`, a gravidade quando a versão exige, e as `RespostaDoFormularioDeOcorrencia` presas às perguntas
daquela versão: **publicar outra versão ou desativar o tipo não reinterpreta o que já foi respondido**. Recusas:
`TIPO-JA-CADASTRADO`, `VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE`, `PERGUNTA-REPETIDA`, `PERGUNTA-SEM-OPCOES`,
`OPCAO-REPETIDA`, `OPCOES-EM-PERGUNTA-QUE-NAO-E-LISTA`, `SITUACAO-JA-E-ESSA`, `TIPO-DESATIVADO`,
`VERSAO-DO-FORMULARIO-NAO-VIGENTE`, `SEM-VERSAO-VIGENTE-NO-DIA`, `GRAVIDADE-EXIGIDA`, `GRAVIDADE-NAO-APLICAVEL`,
`PERGUNTA-DE-OUTRA-VERSAO`, `PERGUNTA-OBRIGATORIA-SEM-RESPOSTA`, `RESPOSTA-INVALIDA`, `RESPOSTA-REPETIDA`,
`RESPOSTA-SEM-FORMULARIO`.

Telas: `/licitacoes/fiscalizacao/agenda` (dia, semana, mês, filtros, reagendar, cancelar e realizar em cada
compromisso), `/licitacoes/fiscalizacao/tipos-de-ocorrencia` (cadastro, versões com perguntas, ativar/desativar) e, no
dossiê do contrato, o formulário do tipo escolhido dentro da ocorrência. Ação nova: `GERIR_TIPOS_DE_OCORRENCIA`
(atualização de permissões v21; reagendar, cancelar e realizar NÃO são ações novas). Migrations
`20260920090000_v7_m2_8_enum_dos_tipos_de_ocorrencia` e `20260920090100_v7_m2_8_agenda_e_formularios` (8 CHECKs).
Testes: `test/agenda-e-formularios.test.ts` (AG01–AG03, FO01–FO02). Fora deste incremento: notificação ao fiscal
(`NOTIFICACAO-DA-AGENDA`), compromisso recorrente, anexos na realização, exportação da agenda e a regra de
sobreposição (não existe fonte).

## Arquivos

- `dominio.ts` — puro: `MODALIDADES`, `SINAL_VALOR_CONTRATUAL`,
  `SINAL_PRAZO_CONTRATUAL`, `TIPO_DO_ESTORNO`, `valorAtualizado`, `vigenciaFim`,
  `estaVigente`, Zod (o XOR).
- `contratos.ts` — serviços (fail-closed com SELECT dentro da transação) e as
  derivações que leem o banco.
- `prisma/schema/m11-licitacoes.prisma`; `prisma/sql/uq_estorno_contratual_unico.sql`
  e `prisma/sql/ck_movimento_contratual_xor.sql` (⚠️ como todo SQL de `prisma/sql/`,
  precisam ser aplicados **também em dev/prod** — o Prisma não os expressa).
- `documento-fiscal.ts`, `xml-nfe.ts`; `prisma/schema/m11-compras.prisma` (documento recebido);
  `prisma/sql/uq_documento_fiscal_chave.sql`, `uq_documento_fiscal_arquivo_hash.sql`.
