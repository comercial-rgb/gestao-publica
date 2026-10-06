# M02b — Planejamento plurianual (PPA e LDO)

O M02 é a LOA **operacional** — ficha, dotação, receita prevista, o grão de execução.
O M02b é o que vem **antes** dele: o plano de quatro anos e as diretrizes do exercício.
Ele não executa nada.

Esta separação não foi inventada aqui. `modules/m02-planejamento/MODULO.md:14` e `:244`
já diziam que *"PPA/LDO/LOA e anexos ficam no M02b"*.

## Procedência (sessão noturna V4, §8, Fila A)

Este módulo veio do **siafic-cg** (commit `c04ad5a760dfbce977ef7f28db7e42ee49d85761`),
conciliado seletivamente, como o prompt V4 pede:

| Entrou | Como |
|---|---|
| `prisma/schema/m02b-plurianual.prisma` (20 models) | como estava; back-relations acrescentadas nos models locais do M02 |
| `dominio.ts`, `servico.ts`, `consultas.ts` | como estavam — os imports já eram os deste repositório |
| `anexos/{tipos,ldo}.ts` + teste | como estavam (funções puras sobre DTO) |
| `m02b-plurianual.test.ts`, `m02b-meta-fiscal.test.ts` | como estavam |
| 10 ações no censo (`acoes.ts`, enum do Prisma, `AREA_DA_ACAO`) | migration separada `_v4_acoes_plurianual` |
| migration das tabelas | **gerada aqui** (`prisma migrate diff` sobre o schema local); os CHECKs vieram da migration de origem, um a um |
| atualização de permissões **v5** | própria deste repositório: quem cria FICHA no escopo global recebe as dez |

**Não entrou:** as telas da origem (`app/(areas)/planejamento/plurianual/*`, sobre o
`lib/scaffold` do siafic-cg, que aqui não existe), as portas `lib/portas/plurianual*.ts`
e `test/ui/plurianual-telas.test.ts`. As telas daqui são do **molde** (`lib/molde/`), com
descritores em `lib/portas/recursos/plurianual*.ts` — ver a seção "Telas".

## Estado: SCHEMA + CRIAÇÃO + ANEXOS PUROS + TELAS DO MOLDE + ALTERAÇÃO VERSIONADA

A ordem foi deliberada. No M10 descobrimos **nove serviços que movimentavam o bem e
nenhum que o criava** — os únicos `create` de `BemPatrimonial` estavam no seed. Tabela
que só o seed alcança é tabela fora do censo: ninguém pode ser negado nela porque
ninguém sabe que ela existe. Aqui a criação veio primeiro.

## A procedência dos campos — leia antes de confiar

O enunciado da origem indicou como fonte as specs SIGA/TCM-BA **48, 49 e 76 a 82**.
**Nenhuma delas está transcrita neste repositório.** As listas de campos vieram do
enunciado, escritas por quem leu o manual v44. Fonte legítima — mas **não é spec
conferida**, e este módulo **não afirma conformidade SIGA**. Quando as specs forem
transcritas (com `origemSpec: "manual-v44-2014"`, como as outras), a geometria destes
models terá de ser conferida contra elas.

Os domínios tabelados (`codigoPassivo` 1–8/99, `tipoAplicacao` 1–5) vêm da mesma fonte —
e é por isso que são **CHECK**, não enum do Prisma: um enum congelaria em migration um
rol não conferido, e mudá-lo exigiria `ALTER TYPE`. O CHECK é uma linha de SQL.

## Decisões, inclusive as NEGATIVAS

### 1. `resultadoPrimario` NÃO é coluna

É `receitaPrimaria − despesaPrimaria`, e as duas parcelas estão gravadas em
`MetaAnualLdo`. Guardá-lo seria **cache de dinheiro** — o bug do TR 5.9. A derivação
vive em `resultadoPrimario()` e é **uma**. Idem `dividaLiquida()` e `margemDeExpansao()`.

`resultadoNominal` **é** coluna, e a assimetria é real: ele depende da variação da dívida
fiscal líquida entre exercícios, e essa variação não está entre os campos armazenados.
Derivá-lo seria inventar.

### 2. Nenhuma entidade tem `unidadeOrcId`

`unidadeOrcId` existe em **uma** entidade do sistema inteiro (`FichaOrcamentaria`), e
toda a segregação do TR 6.5 está construída sobre isso (`modules/m16-travamento/escopo.ts`).
Planejamento plurianual é ato do **ente** — o PPA é lei municipal, não peça de unidade.
O canário `t5` quebra se alguma das 20 tabelas ganhar a coluna. **Se ele quebrar, não é
para consertar o teste**: é para reescrever aquela decisão, conscientemente.

### 3. `ProgramaPpa` NÃO repete `objetivo`

`Programa.objetivo` já existe no M02. Um programa tem **um** objetivo; duplicá-lo por
plano criaria duas respostas para a mesma pergunta. O que varia por plano é a
**estratégia** e o valor previsto — e esses são campos deste model.

### 4. O quadriênio é `anoFim − anoInicio == 3`, não `== 4`

As duas pontas são inclusivas: 2026 a 2029 são **quatro** exercícios e a diferença é
**três**. Conferido em três camadas: Zod (a mensagem que o usuário lê), CHECK (o INSERT
direto), `@@unique([anoInicio])` (dois planos no mesmo período).

### 5. Uma linha por ano, não quatro colunas

`PrevisaoReceitaPpa` tem `ano` + `valor`, e não `ano1..ano4`.

### 6. 22 serviços, 11 ações — agrupadas pelos ANEXOS DA LRF

Quem monta o Anexo de Metas Fiscais (art. 4º §1º) não é quem monta o de Riscos (art. 4º
§3º), e nenhum dos dois é quem cadastra a árvore temática do PPA. Uma ação por serviço
daria **vinte crachás que ninguém concede separadamente**; uma ação só daria o crachá que
abre o planejamento inteiro. O mapa serviço → ação está em `acoes.ts`, com o motivo por
grupo.

A décima primeira é `ALTERAR_PLANEJAMENTO` (V18/C13), para os dois serviços da alteração e para as
DUAS peças — e ela não acompanha `CADASTRAR_PPA` nem `CADASTRAR_LDO`: digitar a peça que o Executivo
monta e assinar a lei que altera a peça **aprovada** são autoridades diferentes no ente.

### 7. Onde o guard NÃO pôde ser CHECK

"O ano da previsão está dentro do quadriênio" cruza **duas tabelas**, e CHECK não
atravessa tabelas. O guard vive no serviço, dentro da transação, lendo o plano.

### 8. Onde NÃO há CHECK de sinal, e por quê

- `MetaAnualLdo.resultadoNominal` — déficit nominal é resultado legítimo;
- `ProjecaoAtuarialRpps.resultadoPrevidenciario` e `saldoFinanceiro` — um RPPS
  deficitário é **exatamente** o que a projeção atuarial existe para revelar;
- `IndicadorPrograma` — indicador pode medir perda.

### 9. A alteração da peça é ATO + AJUSTE COM SINAL, nunca cópia por versão (V18/C13)

O PPA e a LDO podem ser alterados por lei depois de aprovados, e C13 exige *"original, atos e
valores alterados preservados"*. O mecanismo é o que o repositório já usa duas vezes para a LOA (a
reprevisão da receita e o crédito adicional do M03): `AtoDeAlteracaoDoPlanejamento` é a lei ou o
decreto, `AlteracaoDeValorPlanejado` é o valor que ela mexeu, **com sinal**, e a linha aprovada
nunca muda. O valor vigente é `original + soma dos ajustes` — derivação, nunca coluna cache.

**"A versão da peça" é o estado dela até um ato ou até uma data.** Não existe versão nomeada nem
cópia da peça: a candidata `versaoId` nas 20 tabelas exigiria derrubar `@@unique([anoInicio])` e
`exercicio @unique`, as duas unicidades que existem para impedir duas verdades sobre o mesmo
período. Recusada em `docs/varreduras/varredura-v18-versao-do-planejamento.md`.

**⚠️ E O DELTA AO LADO DA LINHA DESLIGA OS CHECKS DA LINHA.** Cinco CHECKs deste módulo governam as
colunas que uma alteração mexe; o `INSERT` do item não toca a tabela vigiada, então nenhum deles é
avaliado sobre o valor que o sistema passa a exibir. `violacoesDoAlvo` (em `alteracao.ts`) reimpõe
cada predicado sobre o valor **derivado**, dentro da transação, e cada mensagem cita a constraint
que espelha. Sem isso, esta tabela seria a rota que aceita previsão de receita negativa e receita
primária maior que a total.

**Quatro alvos, treze grandezas** (previsão de receita do PPA, teto do programa, meta financeira da
ação, e as dez colunas de dinheiro da `MetaAnualLdo`) — e não as 29 colunas de dinheiro do módulo.
O motivo de cada exclusão está em `alteracao.ts`; a meta **física** fica de fora por precisão
(`Decimal(18,6)` contra o dinheiro `Decimal(18,2)`): pendência `ALTERACAO-DE-META-FISICA`.

**`metasAnuaisVigentes` é o dono da derivação.** Os dois leitores que já existiam da meta fiscal —
o Anexo de Metas Fiscais em PDF (`lib/portas/anexos-ldo.ts`) e a meta que o **RREO Anexo 6**
confronta (`metaFiscalDoExercicio`) — passam por ele. Com zero atos o número é idêntico ao de
antes, e é essa igualdade que permitiu pôr a derivação debaixo de relatório já publicado.

### 10. A LDO não tem previsão orçamentária, e isso apareceu em C13

O TR pede alteração da receita da LDO "informando a entidade, a conta de receita" (5.9.2.3) e
importação da previsão de receita e de despesa (5.9.2.6/.7). **Não existe `PrevisaoReceitaLdo` nem
`PrevisaoDespesaLdo`**: os nove models da LDO são o trâmite, as prioridades (meta física), as metas
anuais e os anexos da LRF. Do lado da LDO, o que a V18 versiona é a **meta fiscal**, não a dotação —
e o catálogo está marcado dizendo isso. Pendência `LDO-SEM-PREVISAO-ORCAMENTARIA`.

## Precisão decimal

| Coisa | Tipo | Por quê |
|---|---|---|
| Dinheiro | `Decimal(18,2)` | regra de ouro do repositório |
| Índice / percentual | `Decimal(9,6)` | o limite do Senado (Res. 40) é 1,2 da RCL — dois decimais perderiam a casa que separa cumprir de descumprir |
| Indicador de programa | `Decimal(18,6)` | não é dinheiro |
| Meta física | `Decimal(18,6)` | "3,5 km" e "0,25 do sistema" são metas legítimas |

## Os anexos legais — e o que NÃO foi conferido

`anexos/ldo.ts` gera oito anexos tabelares da LDO (metas anuais, riscos fiscais, renúncia
de receita, alienação de bens, projeção do RPPS, dívida consolidada, margem de expansão,
prioridades). São **funções puras sobre DTO**.

**O layout oficial destes anexos está no Manual de Demonstrativos Fiscais (MDF) da STN,
que NÃO está transcrito neste repositório.** O conteúdo é conferível (cada anexo cita o
artigo que o obriga, e o fechamento é testado); o layout não. Nenhuma função declara
conformidade com o MDF, e há teste que falha se o código passar a dizê-lo. Todo anexo
carrega `NOTA_LIMITE_DE_FONTE`.

| Anexo | Fechamento |
|---|---|
| riscos, renúncia, alienação | `total == Σ linhas` |
| metas anuais, RPPS, dívida, margem | **sem total** — série por exercício; o fechamento é a **derivação** da linha |
| prioridades | **sem total** — meta física de unidades diferentes não soma |
| alienação | `Σ aplicações ≤ alienação` — desigualdade: produto ainda não destinado é informação, não erro |

## Telas (molde)

A alteração da peça tem tela PRÓPRIA, escrita à mão: `/planejamento/alteracoes` (aprovado ×
ajuste × vigente, os atos em ordem cronológica, o histórico de cada linha com a justificativa, o
total por grandeza e o corte "situação até"). Ela não é do molde porque o comparativo não é
listagem de recurso: ele cruza a linha aprovada com a soma dos atos.

Descritores em `lib/portas/recursos/plurianual.ts` e dados em
`lib/portas/recursos/plurianual-dados.ts`; rotas sob `/planejamento/ppa` e
`/planejamento/ldo`, com os cadastros dependentes como AÇÕES do detalhe (programa no
plano, indicador, ação do plano, previsão e série histórica da receita; prioridade, meta
anual, risco, renúncia, alienação e aplicação, dívida, RPPS e margem). A árvore temática
(eixo, área, público-alvo, macroação) tem cadastro próprio em
`/planejamento/ppa/estrutura`. A leitura é `CONSULTAR_PLANEJAMENTO`; a escrita é a ação
do grupo. Os anexos da LDO saem em PDF pela rota autenticada do detalhe.

## Fora de escopo aqui

- **Exportação SIGA** → depende de as specs 48/49/76-82 serem transcritas primeiro.
- **LOA operacional** (ficha, dotação, receita prevista) → M02.
- **Limites constitucionais** (educação, saúde, pessoal) → M12/relatórios.
- **Vínculo PPA → LOA** (a ficha que executa a ação do plano) → ainda não existe; exigiria
  decidir se a amarração é por `Acao` ou por `AcaoPpa`. Decisão consciente, não
  esquecimento. Pendência `VINCULO-PPA-LOA`.
- ~~**Emenda parlamentar**~~ **na LOA, modelada na V36** (`emendas.ts`, TR 5.9.3.13-15). O rito
  ficou assim, sem estado mutável: a emenda e os itens (com sinal) são inserts; a SANÇÃO é outro
  registro (total, rejeição ou parcial com os itens escolhidos); a situação é derivada dela. A
  emenda atua sobre a **proposta orçamentária ainda não efetivada** (o projeto de lei), e só a
  sanção a muda, gravando um `AjusteDeDespesaDaProposta` por item aprovado (vigente + item, na
  mesma transação, recusa tudo se alguma linha ficar negativa). Bloqueio de dotação para emenda:
  insert, liberado por outro insert que o revoga. Duas autoridades: `CADASTRAR_EMENDA_AO_ORCAMENTO`
  e `SANCIONAR_EMENDA_AO_ORCAMENTO`. A compensação (CF art. 166, §3º) é mostrada, não imposta.
  **Falta no PPA e na LDO** (TR 5.9.1.21-23, 5.9.2.11-13): a sanção deve gerar o ato de alteração
  do planejamento, e na LDO não há "dotação" (só metas anuais). Pendência `EMENDA-PPA-LDO`.
- **Importação de peça anterior** (TR 5.9.1.5, .7, .9, .10, 5.9.2.5-7) → cópia não é versão, e
  nenhum serviço `importar*` existe aqui. Pendência `IMPORTACAO-DE-PECA-ANTERIOR`.
- **Audiências públicas** com as solicitações da comunidade (TR 5.9.1.1-2) → outro domínio.
- **Todas as consultas por versão** (a segunda metade de 5.9.1.30 e 5.9.2.18): as telas do PPA e
  os oito anexos da LDO mostram o vigente, não a posição de uma data passada; só o comparativo
  aceita o corte. Pendências `CONSULTA-POR-VERSAO-NAS-DEMAIS-TELAS` e `VERSAO-NOMEADA-DA-PECA`.
- **Compatibilizar PPA para LDO e LOA** (TR 5.9.1.25) → pressupõe `VINCULO-PPA-LOA`.

  ⚠️ A pendência `PPA-LDO-VERSOES-E-EMENDAS` **encolheu na V18**: as versões do PPA/LDO com
  comparativo e corte por data passaram a existir (ver a decisão 9). O que sobra dela é o que está
  listado acima.

## A LOA consolidada e os anexos da Lei 4.320/64 (V22)

`anexos/loa.ts` (puro) e `consultas-loa.ts` (leitor) montam a LOA do exercício a partir do que a
execução já usa — **sem segunda fonte**: despesa = `valorDotado` das fichas; receita =
`ReceitaPrevista` com `SINAL_PREVISAO` (dedução subtrai). Tela `/planejamento/loa` (leitura do
ente, `CONSULTAR_PLANEJAMENTO`), PDF em `/planejamento/loa/pdf`, Excel por anexo em
`/planejamento/loa/xlsx?anexo=N`; porta `lib/portas/loa.ts`.

| Anexo | Grão | Fecha com |
|---|---|---|
| 1 | receita por categoria › origem (deduções à parte); despesa por categoria › grupo; resultado do orçamento corrente | receita / despesa |
| 2 | receita por categoria › origem › natureza; despesa por categoria › grupo › natureza, consolidada e por unidade | receita / despesa / Σ unidades |
| 6 | por unidade: função › subfunção › programa › ação × projetos, atividades, operações especiais | Σ unidades |
| 7 | consolidado, idem | despesa |
| 8 | função › subfunção › programa × ordinários, vinculados — pela natureza DECLARADA da fonte (M01) | despesa |
| 9 | órgão › função; total por função | despesa |

**O instrumento é `conferirLoa`**: folhas = linha de total por coluna; colunas parciais = total da
linha; cada quadro contra o total de REFERÊNCIA, que o leitor soma por outro caminho
(`dotacaoFixadaDetalhada`, `previsaoPorNaturezaFonte`). Diverge → `ConferenciaDaLoaError`, a LOA
não sai. Provado por mutação nas duas direções (ficha a menos no Anexo 7; checagem das partes
desligada).

**Não emitidos, com motivo (nunca inventados):** Anexo 8 quando alguma fonte das fichas não tem
natureza declarada (ou não é ordinária/vinculada); quadro dos fundos especiais (Lei 4.320, art. 2º,
§ 2º, I — unidade não se marca como fundo e a receita não tem unidade); compatibilidade com as
metas da LDO (LRF art. 5º, I — pendência `VINCULO-PPA-LOA`); demonstrativo regionalizado (CF art.
165, § 6º — sem regionalização). Anexos 3, 4 e 5 da lei são rols de classificação, não
demonstrativos de valor, e não foram gerados.

Limite de fonte: o leiaute segue a Lei 4.320/64 e os títulos oficiais; o modelo gráfico oficial não
está transcrito aqui.

## V35 C9 — o planejamento no portal da transparência (LRF, art. 48)

`/transparencia/planejamento`, sem sessão (porta `lib/portas/planejamento-publico.ts`). Só o que virou lei:
- **PPA:** quadriênio, lei e data de publicação;
- **LDO sancionada** (`dataSancao` registrada): os oito anexos em PDF, pelo mesmo motor da rota interna
  (`/transparencia/planejamento/ldo/<id>/<anexo>`);
- **LOA com lei de aprovação:** número da lei, sanção, publicação e veículo; o resumo e os anexos da Lei 4.320/1964
  pela mesma montagem e conferência da tela interna (`loaParaTela`, em `/transparencia/planejamento/loa/<exercício>`);
  e os documentos anexados à LOA (`/transparencia/planejamento/documento/<id>`).

O documento público passa por `baixarAnexoPublicoDaLoa` (M22): só sai anexo de LOA aprovada; qualquer outro anexo
responde 404, como "não existe". `attachment` e `nosniff`, como na rota interna. Projeto em tramitação, LDO sem
sanção e exercício sem lei: fora do portal.

Pendência: PPA e LDO não têm documentos anexados no cadastro (só a LOA tem); a lei do PPA aparece pela referência.
