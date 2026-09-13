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

## Estado: SCHEMA + SERVIÇOS DE CRIAÇÃO + ANEXOS PUROS + TELAS DO MOLDE

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

### 6. 20 serviços, 10 ações — agrupadas pelos ANEXOS DA LRF

Quem monta o Anexo de Metas Fiscais (art. 4º §1º) não é quem monta o de Riscos (art. 4º
§3º), e nenhum dos dois é quem cadastra a árvore temática do PPA. Uma ação por serviço
daria **vinte crachás que ninguém concede separadamente**; uma ação só daria o crachá que
abre o planejamento inteiro. O mapa serviço → ação está em `acoes.ts`, com o motivo por
grupo.

### 7. Onde o guard NÃO pôde ser CHECK

"O ano da previsão está dentro do quadriênio" cruza **duas tabelas**, e CHECK não
atravessa tabelas. O guard vive no serviço, dentro da transação, lendo o plano.

### 8. Onde NÃO há CHECK de sinal, e por quê

- `MetaAnualLdo.resultadoNominal` — déficit nominal é resultado legítimo;
- `ProjecaoAtuarialRpps.resultadoPrevidenciario` e `saldoFinanceiro` — um RPPS
  deficitário é **exatamente** o que a projeção atuarial existe para revelar;
- `IndicadorPrograma` — indicador pode medir perda.

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
- **Emendas, bloqueio de dotação para emenda, versões do PPA/LDO, importação de peça
  anterior, audiências públicas** (TR 5.9.1.1–2, 5.9.1.5–10, 5.9.1.21–23, 5.9.1.30,
  5.9.2.5–7, 5.9.2.11–13, 5.9.2.18) → não modelados. Pendência `PPA-LDO-VERSOES-E-EMENDAS`.
