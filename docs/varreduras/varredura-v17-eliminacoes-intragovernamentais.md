# Varredura V17 — as eliminacoes intragovernamentais na consolidacao (C07)

**Data:** 2026-09-27 · **Antes de construir**, como em `varredura-v16-distribuicao-da-receita-por-fontes.md`.

C07 (V14): *"Identificar contraparte e natureza e preparar eliminacoes cabiveis na consolidacao"*,
com o critério *"Visao individual preservada e ajuste consolidado explicavel"*.

O achado do checkpoint dizia: **ausente, e admitida pelo proprio codigo**
(`modules/m16-travamento/acoes.ts`). Ele foi **conferido antes de construir**, e o que a conferencia
achou muda o desenho: **metade de C07 ja existe e e usada todo dia**; a outra metade tem um
impedimento estrutural que C07 **nao** precisa remover; e a regra de classificacao tem **tres
candidatas plausiveis que dao tres respostas diferentes**, duas delas destrutivas.

## 1. A admissao do codigo, lida por inteiro

`modules/m16-travamento/acoes.ts:302-305`, sobre a V11 V9:

> *"A 5.10.1.3 pede mais de uma UNIDADE na mesma base com contabilizacao distinta e consolidacao
> da LRF — proximo, mas nao literal: aqui a entidade titular e atributo de um FATO de receita, e a
> **consolidacao nao foi construida**."*

A admissao e exata e **continua valida**. O que ela nao diz — e a varredura mediu — e que a
*identificacao* da natureza intragovernamental existe em tres lugares, oficial, e ja alimenta
relatorio publicado.

## 2. O que JA EXISTE (e nao se reconstroi)

| Marcador oficial | Onde vive | Quem ja o le |
|---|---|---|
| Receita **categoria 7/8** (correntes/capital INTRA-orcamentarias) | `modules/m04-receita/natureza.ts:266` `ehIntraorcamentaria` | RREO Anexo 1 (`intraReceitas`), Anexo 6 (exclui do primario), `consistencia-loa.ts` |
| Despesa **modalidade de aplicacao 91** | `FichaOrcamentaria.naturezaDespesa.modalidade` | RREO Anexo 2 (quadro II proprio), Anexo 7 (RPNP intra), `consistencia-loa.ts` |
| Contas PCASP **INTRA OFSS** | `docs/oficial/tce-pb/Pcasp_2025.xlsx` (7.864 contas) | **ninguem** — so um comentario em `migracao-de-conta.ts:17` |

E ja existe a verificacao `LOA_INTRA` (`consistencia-loa.ts:122`): *receita intra prevista ==
despesa intra fixada*, com interruptor `SEM_DADO` nomeado. Ela cobre a **PREVISAO**. Nao existe a
mesma coisa na **EXECUCAO** — e a execucao e o que o criterio de C07 pede ("ajuste consolidado").

E existe a **ENTIDADE CONTABIL** (V11 V9): identidade estavel + versoes com `cnpj` e `tipoManad`,
declaracao de titular por conta bancaria, e atribuicao para guia legada
(`prisma/schema/m01-entidade-contabil.prisma`). Ela e atributo de um fato de **receita**, e o
`cnpj` da versao vigente e o que permite reconhecer a contraparte do outro lado.

## 3. A REGRA DE CLASSIFICACAO — tres candidatas, tres respostas, medidas no arquivo oficial

Medido com `carregarPlanoOficial()` sobre o `Pcasp_2025.xlsx` (7.864 contas do bloco 2025):

| Candidata | Quantas contas ela marca como intra | O que ela erra |
|---|---|---|
| **(a) o nome diz "INTRA"** | **296** | perde **699**: o nome so aparece na ancora de nivel 5; item e subitem herdam a natureza sem repetir o nome |
| **(b) o 5o digito do codigo e 2** | **1.130** | marca **137 a mais**, e entre elas as contas que este sistema escreve todo dia |
| **(c) 5o digito 2 **e** a ancora de nivel 5 declara o nivel** | **993** | — |

**A (c) e a regra, e ela nao e um padrao: e a propriedade.** O 5o nivel do PCASP e o *nivel de
consolidacao* **onde o plano o declara**, e ele o declara no nome da ancora `X.X.X.X.D.00.00`:

```
1.1.1.1.1.00.00  CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - CONSOLIDACAO
1.1.1.1.2.00.00  CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS
1.1.2.1.3.00.00  CREDITOS TRIBUTARIOS A RECEBER - INTER OFSS - UNIAO
1.1.2.1.4.00.00  CREDITOS TRIBUTARIOS A RECEBER - INTER OFSS - ESTADO
1.1.2.1.5.00.00  CREDITOS TRIBUTARIOS A RECEBER - INTER OFSS - MUNICIPIO
```

Onde ele **nao** declara, o 5o digito e outra coisa. Sao **51 ancoras** de digito 2 sem declaracao,
e entre elas:

| Conta | Nome oficial | O que este sistema faz com ela |
|---|---|---|
| `5.2.2.1.2.00.00` | DOTACAO ADICIONAL POR TIPO DE CREDITO | `CONTA_CREDITO_ADICIONAL_SUPLEMENTAR/ESPECIAL/EXTRAORDINARIO` (`roteiros.ts:108`) — **toda suplementacao** |
| `8.2.1.1.2.00.00` | DISPONIBILIDADE ... COMPROMETIDA POR EMPENHO | `CONTA_DDR_COMPROMETIDA_EMPENHO` (`roteiros.ts:350`) — **todo empenho** |
| `7.2.1.1.2.00.00` | RECURSOS VINCULADOS | `NATUREZA_DA_FONTE.VINCULADOS` (`roteiros.ts:293`) — **toda arrecadacao de fonte vinculada** |
| `6.2.2.1.2.00.00` | CREDITO INDISPONIVEL | bloqueio / pre-empenho |

Nas classes **5 e 6** o 5o nivel nao e nivel de consolidacao em lugar nenhum (`5.1.2.1.1 PLOA
INICIAL DA RECEITA`, `6.2.1.3.1 (-) DEDUCOES POR TRANSFERENCIAS`); nas classes **7 e 8** ele e nivel
de consolidacao no grupo `x.1` e **nao e** no `x.2` (a DDR). A candidata (b) marcaria como
"transacao entre orgaos do mesmo ente" a suplementacao, o empenho e a fonte vinculada do proprio
municipio — e o demonstrativo consolidado as **eliminaria**.

**O inverso foi medido e fecha:** ZERO contas cuja ancora declara INTRA OFSS tem 5o digito
diferente de 2. As duas unicas contas com "INTRA" no nome fora de uma ancora intra sao os
cabecalhos de nivel 3 `3.5.1.0.0.00.00` e `4.5.1.0.0.00.00 TRANSFERENCIAS INTRAGOVERNAMENTAIS`, que
sao **sinteticas** e nunca recebem partida.

⚠️ E ha um caso que a (a) e a (c) tratam diferente e a (c) acerta: em `3.5.1.x` e `4.5.1.x`
(transferencias intragovernamentais) **nao existe irma `.1 CONSOLIDACAO`** — uma transferencia
intragovernamental so pode ser intra. Uma regra escrita como "tem irma CONSOLIDACAO" perderia as
**46 + 47** contas de VPD/VPA de transferencia intragovernamental, que sao justamente as mais
relevantes de um municipio (a prefeitura que repassa ao fundo). A regra e o **nome da propria
ancora**, nao a existencia da irma.

## 4. O impedimento estrutural — e por que C07 NAO precisa remover

`LancamentoContabil` e `PartidaContabil` **nao tem dimensao de entidade** (nem de orgao). O proprio
`m01-entidade-contabil.prisma` o diz em letra maiuscula: *"a amarracao S1 corre sobre um razao que
nao tem entidade nenhuma"*, e estreita a pendencia para `SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS`.

Logo **o balancete por entidade nao existe e nao nasce nesta unidade** — ele e a 5.10.1.3, que pede
contabilizacao distinta por unidade na mesma base. Por essa clausula o sistema segue **AUSENTE**, e
marca-la seria mentir.

Mas o criterio de C07 e outro: *"visao individual preservada e ajuste consolidado explicavel"*. A
**visao individual se preserva por construcao** quando a eliminacao e um **DEMONSTRATIVO** e nao um
lancamento: nada se escreve no razao, nada se ajusta, e o individual e exatamente o que ja se ve
hoje. O MCASP pede justamente isso da eliminacao intra — ela e feita **na consolidacao**, nao na
escrituracao da entidade.

⚠️ **E a alternativa foi considerada e recusada:** lancar a eliminacao como partida de ajuste
exigiria uma entidade "consolidado" no razao e produziria um razao que nao e de ninguem — o oposto
de "visao individual preservada", e um `UPDATE` conceitual sobre saldo ja publicado.

## 5. O que esta unidade constroi

1. **A regra, uma vez, no M01** — a classificacao (c), pura, com a ancora lida do proprio plano.
   Nenhuma coluna nova, nenhuma migration: a autoridade e a tabela oficial que ja esta no banco.
2. **O demonstrativo de eliminacoes (M12)** — tres pares, cada um visitando o dono da identidade:
   - **E1 orcamentario:** receita intra arrecadada (categoria 7/8) x despesa intra liquidada
     (modalidade 91), lidas do **RREO Anexo 1**, que ja as separa (`intraReceitas`/`intraDespesas`).
   - **E2 patrimonial:** VPD de transferencia intragovernamental concedida (`3.5.1.x`) x VPA
     recebida (`4.5.1.x`).
   - **E3 reciproco:** ativo intra x passivo intra (o meu direito contra voce e a sua obrigacao
     comigo).
   Cada par mostra esquerda, direita e **o residuo** — o residuo E o "ajuste explicavel".
3. **A contraparte, onde o fato a permite, e nomeada onde nao permite.** A despesa intra tem
   `Empenho.credorCpfCnpj`; a entidade contabil tem `cnpj` na versao vigente. Casar os dois
   identifica a contraparte **a partir de fato ja gravado**. Sem casamento, a linha diz
   *contraparte nao identificada* — nunca se adivinha.
4. **Duas verificacoes na consistencia da EXECUCAO**, irmas de `LOA_INTRA`, com `SEM_DADO` nomeado.
5. **Tela e percurso.** Sem tela um servidor municipal nao alcanca, e o catalogo nao promove.

## 6. O que esta unidade NAO faz — nomeado

- **5.10.1.3 segue AUSENTE**: contabilizacao distinta por unidade na mesma base pede entidade no
  razao. Nao se marca.
- **Eliminacao nao vira lancamento.** Ver secao 4.
- **Inter OFSS (digitos 3/4/5) nao se elimina.** Transacao com a Uniao ou com o Estado nao e intra
  do municipio; classificar sim, eliminar nao.
- O achado lateral: `docs/oficial/tce-pb/captura20-consolidacoes.html` fala de "consolidacoes" do
  SAGRES Captura, que sao **regras de validacao cruzada** (empenho x dotacao, liquidado x empenho),
  **nada a ver** com consolidacao de demonstracoes. Quem procurar leiaute de eliminacao ali nao
  acha, e e bom que esteja escrito.
