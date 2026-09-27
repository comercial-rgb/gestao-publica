# Varredura V16 — a distribuicao da arrecadacao entre fontes (C30)

**Data:** 2026-09-27 · **Antes de construir**, como em `varredura-v15-roteiro-dos-restos-a-pagar.md`.

C30 (V14): *"Distribuir receita por fontes conforme LOA; permitir alteracao autorizada no ato"*,
com o critério *"Parcelas somam total; snapshot preservado no estorno"*.

O achado do checkpoint dizia: **nao existe distribuicao de uma arrecadacao entre fontes com
snapshot; a guia tem UMA fonte (via `ContaBancaria.fonteId`)**. Ele foi **conferido antes de
construir** — o de C34 continuava valido, o do SAGRES nao estava — e **continua valido**, com uma
precisao e dois achados novos.

## 1. O impedimento e ESTRUTURAL, e a medida e esta

`ReceitaArrecadada.fonteId` e `String` **NOT NULL** (`prisma/schema/m04-receita.prisma:43`), e a
chave e `@@unique([exercicio, numeroReceita, tipo])` (`uq_receita_guia`). As duas juntas dizem:

> **um numero de guia, no exercicio, produz UMA linha — e essa linha tem UMA fonte.**

Logo **nao ha como registrar um deposito unico repartido entre fontes**. O contorno seria inventar
numero de documento (`123-A`, `123-B`), que e inventar identidade de documento. E nao e detalhe de
digitacao: a perna de **classe 7** da DDR sai da natureza DA FONTE
(`contaDeControleDaDdr`, `modules/m01-core-contabil/roteiros.ts:664`), entao uma guia de FPM
repartida entre ordinarios e vinculados hoje carimbaria **o total inteiro numa unica natureza de
destinacao** — e o erro sai no RGF Anexo 5, nao aqui.

**A LOA ja reparte.** `ReceitaPrevista` tem chave
`[exercicio, naturezaReceitaId, exercicioFonte, fonteId, tipoReceita]`: a mesma natureza e prevista
em VARIAS fontes. A previsao distribui e a execucao nao — e o "conforme LOA" do C30 e exatamente
essa correspondencia que falta.

**O formato externo tambem ja reparte.** `LAYOUT_RECEITA_ORCAMENTARIA` (SAGRES 2026 v1.1) tem
`numeroReceita`, `codFonteRecurso`, `exercicioFonteRecurso` e `valor` — e **nenhum campo de total**.
Duas linhas com o mesmo numero de guia e fontes diferentes e o que o TCE espera receber. Quem nao
tem como repartir e o nosso modelo, nao o leiaute.

## 2. Dois achados novos, nao previstos pelo levantamento

**(a) O guard da fonte da arrecadacao ficou na regra velha.** `lib/portas/arrecadacao.ts` recusa
com *"A conta bancaria X e da fonte 500, e a guia e da fonte 540"* comparando
`ContaBancaria.fonteId` — a fonte **PADRAO**. Mas `docs/adr/ADR-conta-bancaria-com-varias-fontes.md`
(aceito em 2026-09-10) decidiu que **quem manda no guard e o VINCULO** (`FonteDaContaBancaria`), e
`modules/m05-despesa/guard-fonte.ts` existe para isso — usado em **cinco** sitios (pagamento, ordem
de pagamento, movimentacao, dispendio extraorcamentario, pagamento de restos a pagar). A
arrecadacao e o **sexto sitio, e o unico que ficou fora** — porque em 2026-09-10 ela nao tinha conta
bancaria; ela ganhou conta na V6 P1.2 e **copiou a comparacao antiga**. Efeito medivel hoje: uma
conta multifonte **nao recebe** guia da segunda fonte dela, que e o caso que a ADR veio permitir.

**(b) O ADR previu este ponto e o deixou nomeado.** Ele diz, em "O que NAO se decide aqui": *"Nao
se muda o M04 para ganhar conta bancaria"*. O M04 mudou depois. A pendencia nao foi reaberta.

## 3. O modelo — e as tres alternativas descartadas com o motivo

**Escolhida: cabecalho + parcelas.** A guia continua UMA `ReceitaArrecadada` (um numero, um
lancamento, o **total** em `valor`) e ganha `FonteDaArrecadacao`: uma linha por
`(fonte, exercicioFonte)` com o seu `valor`, o `previstaNaLoa` do instante e o `fundamento` de
quem saiu da previsao.

- **A. Varias `ReceitaArrecadada` com o mesmo numero** — viola `uq_receita_guia`, e relaxar a chave
  exigiria **DROP de indice unico** (proibido: migration e aditiva) e deixaria a **conservacao do
  total sem dono**: `123/500 = 100` hoje e `123/501 = 40` amanha, sem nada dizendo que o deposito
  era 140.
- **B. `fonteId` nullable na guia** — nao e DROP de dado, mas troca o tipo de `string` para
  `string | null` em **todos** os leitores de uma vez. Reforma geral, sem necessidade.
- **C. Rateio proporcional a previsao** — inventaria o fato. Um deposito real nao entra na
  proporcao do orcamento, e dividir 100,00 entre tres fontes previstas iguais obrigaria a decidir
  quem fica com o centavo. A previsao **orienta** (aparece na tela com o previsto e o ja
  arrecadado); os valores sao digitados e conferidos.

### O que garante "parcelas somam total": o proprio motor de partidas dobradas

O roteiro da arrecadacao distribuida emite **uma perna de classe 7 por natureza de fonte**, cada
uma com o SEU valor, e **uma perna de classe 8** com o total. `validarLancamento` exige
ΣDEBITO == ΣCREDITO **dentro do subsistema CONTROLE** — logo

> Σ parcelas != total ⇒ **o lancamento nao fecha e nada e gravado.**

A conservacao nao e uma conferencia escrita a mao que alguem possa esquecer: e o invariante (e) do
`packages/ledger/motor.ts`. Para isso a perna do roteiro passou a poder declarar o **proprio
valor** (`PernaRoteiro.valor`, opcional) — quem nao declara recebe o total, como sempre.

### O que garante "snapshot preservado no estorno"

A anulacao **herda as parcelas da original**, como ja herda `entidadeTitularId`, `contaBancariaId`
e `fonteId` (`modules/m04-receita/servico.ts`). Nao se re-deriva da LOA: `ReceitaReprevista` existe,
a previsao muda, e re-derivar faria o estorno desfazer uma distribuicao diferente da que entrou. E
o lancamento de estorno sai de `gerarEstorno`, que inverte **as pernas que existiam** — inclusive
as de classe 7 por natureza.

## 4. O que a guia NAO ganha

- **Nao ha tabela de "pernas" configuravel.** As contas de classe 7 sao a particao do PCASP oficial
  por natureza da fonte, ja resolvida em `CONTA_CONTROLE_DDR_POR_NATUREZA` (V11 V9.3, com a medicao
  do `Pcasp_2025.xlsx`). O que e ATO DO ENTE — de que natureza e a fonte 500 — ja mora em
  `DeParaFonteNaturezaDdr`, fail-closed e versionado.
- **`ReceitaArrecadada.fonteId` NAO sai, e nao vira segunda verdade.** Ele permanece o que a ADR
  disse que ele e: a fonte **padrao** da guia. Quem manda em todo numero POR FONTE passa a ser a
  parcela, por **uma** funcao (`parcelasDaGuia`) — e ela e **fail-closed**: se as parcelas existem e
  nao somam o total da guia, ela recusa nomeando a guia, em vez de devolver numero torto.
- **O caminho de fonte unica que existe hoje nao muda.** `FormArrecadacao` continua registrando
  guia de uma fonte, sem parcela e sem exigencia nova. Exigir fundamento de quem arrecada numa
  natureza que a LOA nao previu contrariaria uma decisao deliberada e escrita naquele formulario
  ("receita nao prevista existe"; `select` fechado ensinaria que so se arrecada o previsto, o que e
  falso). A distribuicao e **ato proprio**, com tela propria.

## 5. Os leitores por fonte — os sete que passam a ler a parcela

| Leitor | O que diria errado numa guia distribuida |
|---|---|
| `arrecadadoPorFonte` (m04) | o superavit financeiro por fonte do Anexo 14 — e ele **autoriza credito adicional** |
| `arrecadadoDetalhado` (m04) | arrecadado por natureza x fonte |
| `saldoDdrPorFonte` (m01) | a DDR disponivel da fonte errada — o numero que **impede empenhar contra dinheiro que nao existe** |
| Balanco Financeiro (m12) | ingressos orcamentarios por fonte |
| SAGRES `ReceitaOrcamentaria` | uma linha so, com o total numa fonte |
| MANAD L200 `COD_REC_VINC` | idem, na remessa federal |
| `listarArrecadacoes` (tela) | uma fonte onde ha varias |

**Conferidos e NAO afetados, com o motivo:** `arrecadadoPorCodigoAcompanhamento` (agrupa por CO),
`arrecadadoPorEntidade` (por entidade titular), Balanco Orcamentario (por natureza),
`caixa.ts`/`conciliacao.ts` do M09 (por CONTA, nao por fonte — e o comentario do proprio arquivo
diz isso), resolver da MSC (le a fonte da guia que originou movimento de divida/alienacao, e a
**operacao composta** do M10 e sempre de fonte unica: ela nao passa pela tela da distribuicao).

## 6. A autorizacao de "alteracao no ato"

Acao nova, nomeada, conferida no servidor: **`DISTRIBUIR_RECEITA_FORA_DA_PREVISAO`**. Ela e exigida
**somente** quando a natureza E prevista na LOA e a parcela usa fonte que a LOA **nao** preve para
ela — o caso em que o operador esta mudando a distribuicao do orcamento no ato. Nesse caso o
`fundamento` da parcela e obrigatorio (CHECK no banco, junto com `valor > 0`). Natureza sem previsao
nenhuma nao pede autorizacao extra: excesso de arrecadacao e legitimo (INVARIANTE 5) e barra-lo
pararia a arrecadacao para cobrar cadastro.

## 7. Percurso devido

guia distribuida entre duas fontes de naturezas diferentes -> os quatro numeros por fonte -> recusa
por soma diferente do total -> recusa por fonte fora do rol da conta -> recusa por falta de
autorizacao/fundamento -> anulacao preservando a distribuicao original.
