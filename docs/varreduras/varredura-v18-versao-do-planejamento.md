# Varredura V18 — versionar a alteracao do PPA e da LDO (C13)

Levantada em 2026-09-27, sobre `180ccd8`, ANTES de escrever codigo. O que esta aqui e
decisao de modelo com o numero medido ao lado; o que nao esta, nao foi decidido.

## O pedido

`docs/lotes/V14-contabilidade-esperanca-dois-dias.md:105`:

> | C13 | Planejamento 4 | Versionar alteracoes de PPA/LDO e emitir comparativo | Original, atos e valores alterados preservados |

E a ausencia e **admitida pelo proprio modulo**. `modules/m02b-plurianual/MODULO.md`, ultima
secao, "Fora de escopo aqui":

> **Emendas, bloqueio de dotacao para emenda, versoes do PPA/LDO, importacao de peca
> anterior, audiencias publicas** (TR 5.9.1.1-2, 5.9.1.5-10, 5.9.1.21-23, 5.9.1.30,
> 5.9.2.5-7, 5.9.2.11-13, 5.9.2.18) -> nao modelados. Pendencia `PPA-LDO-VERSOES-E-EMENDAS`.

Conferido contra o codigo de hoje, nao contra a memoria: zero ocorrencias de `versao`,
`Versao` ou `emenda` em `prisma/schema/m02b-plurianual.prisma`; os 20 models nascem e nunca
mudam de valor. A pendencia continua verdadeira.

## O que a pendencia junta, e o que C13 e

A pendencia nomeia dezenove clausulas. Elas nao sao a mesma capacidade, e tratar como uma
so entregaria um pouco de cada e nada inteiro:

| Grupo | Clausulas | E C13? |
|---|---|---|
| versao da peca e relatorio por versao | 5.9.1.30, 5.9.2.18 | **sim** — e o nucleo |
| alteracao orcamentaria da peca, consulta de todas e de uma | 5.9.1.14, 5.9.2.3 | **sim** |
| consulta cronologica das alteracoes, ate uma data | 5.9.1.18, 5.9.2.10 | **sim** |
| emenda parlamentar: vereador, texto juridico, dotacoes com acrescimo/reducao | 5.9.1.21, 5.9.2.11, 5.9.3.13 | nao — e o ATO de outro poder, com rito proprio |
| bloqueio de dotacao que nao pode sofrer emenda | 5.9.1.22, 5.9.2.12, 5.9.3.14 | nao — guard sobre a emenda, que nao existe |
| sancao total / reprovacao / sancao PARCIAL da emenda | 5.9.1.23, 5.9.2.13, 5.9.3.15 | nao — rito de tramitacao |
| importar peca anterior, LOA ou PPA (so dotacoes, ou dotacoes e valores) | 5.9.1.5, .7, .9, .10, 5.9.2.5, .6, .7 | nao — e COPIA, capacidade oposta |
| compatibilizar: replicar a alteracao do PPA na LDO e na LOA | 5.9.1.25 | nao — ver "o que esta unidade nao faz" |
| audiencia publica com solicitacoes da comunidade | 5.9.1.1, 5.9.1.2 | nao — outro dominio |

C13 e a primeira metade da tabela. As outras ficam nomeadas, e a pendencia
`PPA-LDO-VERSOES-E-EMENDAS` **continua existindo** depois desta unidade, com escopo menor.

## O que ja existe

| Peca | Onde | O que faz |
|---|---|---|
| reprevisao da receita da LOA | `m02-planejamento/ports.ts:109`, `/planejamento/reprevisao` | ajuste append-only COM SINAL sobre a previsao, com motivo, data e autor |
| credito adicional da LOA | M03, `LeiCredito`/`DecretoCredito`/`ItemCredito` | a lei autoriza um teto, o decreto consome, o item tem sinal, nada se edita |
| tramite da LDO | `LeiDiretrizesOrcamentarias`, quatro datas nullable | envio, devolucao, sancao — sem coluna `situacao`, tudo derivado |

O mecanismo que C13 pede **existe no repositorio desde antes** — duas vezes, para a LOA. O
que falta e ele alcancar as duas pecas de cima. E a reprevisao mostra tambem o que falta
nela: ela LISTA os ajustes e nao emite comparativo nenhum — nao ha tela que ponha a previsao
inicial, a soma dos ajustes e a atualizada na mesma linha.

## Tres candidatas para "versionar"

### A — copia da peca por versao (`versaoId` nas 20 tabelas)

O que quebra, medido: `PlanoPlurianual` tem `@@unique([anoInicio])` e
`LeiDiretrizesOrcamentarias` tem `exercicio @unique` — duas copias da mesma peca sao
proibidas pelo banco hoje, e a candidata exige derrubar as duas unicidades, que sao o que
impede "duas verdades sobre o mesmo periodo" (o docblock do model diz isso com essas
palavras). Alem disso: 20 tabelas ganham coluna, **29 colunas de dinheiro** passam a existir
em N copias — cache de dinheiro multiplicado —, e as 8 consultas dos anexos da LDO, que nao
sabem de versao, continuariam lendo a versao 1 em silencio. Recusada.

### B — coluna `versao` e UPDATE no valor

Recusada pelo invariante 2 do `CLAUDE.md` (razao append-only) e por perder o original por
construcao, que e exatamente o que a prova de C13 exige preservar.

### C — o ATO e o ajuste COM SINAL, append-only; o valor atual e derivacao

O original nunca e tocado. Cada lei/decreto que altera a peca e uma linha; cada valor que
ela mexeu e um item com sinal; o valor vigente e `original + soma dos ajustes`. "A versao da
peca" passa a ser **o estado dela ate um ato ou ate uma data** — derivacao, nao flag que
alguem esquece de virar. E a doutrina que este modulo ja aplicou tres vezes: sem coluna
`vigente` no PPA, sem coluna `situacao` na LDO, sem `resultadoPrimario` gravado.

**Escolhida.**

## O achado que decide a implementacao

Medido em `prisma/migrations/20260913100100_v4_plurianual_ppa_ldo/migration.sql:480-650`: o
M02b sustenta **19 CHECKs** no banco. Cinco deles governam justamente as colunas que uma
alteracao mexe:

| Constraint | Predicado |
|---|---|
| `ck_programa_ppa_valor_nao_negativo` | `valorPrevisto >= 0` |
| `ck_acao_ppa_metas_nao_negativas` | `metaFisica >= 0 AND metaFinanceira >= 0` |
| `ck_previsao_receita_ppa_nao_negativa` | `valor >= 0` |
| `ck_meta_anual_primaria_nao_excede_total` | `receitaPrimaria <= receitaTotal AND despesaPrimaria <= despesaTotal` |
| `ck_meta_anual_valores_nao_negativos` | seis colunas `>= 0` |

**Um delta gravado AO LADO da linha desliga todos eles.** A linha original nao muda, o
`INSERT` do item nao toca a tabela vigiada, e o CHECK nunca e avaliado sobre o valor que o
sistema passa a exibir. Sem cuidado explicito, esta unidade entregaria um caminho pelo qual
uma previsao de receita fica negativa e uma receita primaria ultrapassa a total — as duas
recusadas hoje pelo banco, as duas aceitas amanha pela rota nova. E o `CLAUDE.md` chama isso
pelo nome no invariante 3: *"Bloqueio vale por API, por worker e por rota alternativa."*

Entao o servico **reimpoe cada predicado sobre o valor DERIVADO**, dentro da transacao, e
cada funcao de guard cita o nome da constraint que espelha. E o que o M03 ja faz com o saldo
da dotacao: o SUM real, dentro da transacao, antes de aceitar a anulacao.

E a assimetria fica preservada com ela: `resultadoNominal` NAO tem CHECK de sinal (deficit
nominal e resultado legitimo) e as tres colunas de PPP tambem nao. Reimpor positividade ali
seria inventar uma regra que o banco recusou deliberadamente.

## O alvo: quatro linhas, treze grandezas

Medido nos 20 models: **14 carregam quantidade**, somando **29 colunas `Decimal(18,2)`**, 4
de `Decimal(18,6)` e 1 de `Decimal(9,6)`. Alterar todas as 29 seria confundir duas coisas
diferentes.

Entram (o que uma lei de alteracao orcamentaria de fato mexe):

| Alvo | Grandeza |
|---|---|
| `PrevisaoReceitaPpa` | `valor` |
| `ProgramaPpa` | `valorPrevisto` |
| `AcaoPpa` | `metaFinanceira` |
| `MetaAnualLdo` | as dez colunas de dinheiro do Anexo de Metas Fiscais |

Nao entram, e o motivo:

- **`ReceitaAnteriorPpa`** — e serie HISTORICA de exercicio ja encerrado. "Alterar o
  realizado de 2023" nao e versao de plano: e corrigir um dado, e correcao de dado passado
  nao se faz por lei de alteracao do PPA.
- **riscos, renuncia, alienacao, aplicacao, divida, RPPS, margem** (25 das 29 colunas) — sao
  **declaracoes** dos anexos da LRF, nao dotacao. Quando mudam, o anexo e refeito inteiro; um
  "acrescimo de 10.000 no risco fiscal" nao existe como ato.
- **meta FISICA** (`AcaoPpa.metaFisica`, `PrioridadeLdo.meta`) — sao `Decimal(18,6)`, e a
  coluna de ajuste e dinheiro `Decimal(18,2)`. Misturar as duas precisoes numa coluna
  perderia a casa que a meta persegue ("3,5 km", "0,25 do sistema"), e o `MODULO.md` decidiu
  aquela precisao de proposito. Pendencia: **`ALTERACAO-DE-META-FISICA`**.

E a **`MetaAnualLdo` entra sendo anexo**, contra o critério do paragrafo anterior, porque sem
ela a LDO nao teria grandeza nenhuma alteravel — ver o achado seguinte. E honesto dizer qual
e a excecao e por que ela existe.

## O segundo achado: a LDO nao tem previsao orcamentaria

O TR 5.9.2.3 pede alteracao "informando a entidade, a conta de receita, a justificativa", e
5.9.2.6/5.9.2.7 pedem importar "previsao da despesa" e "previsao da receita" da LDO. Medido:
**nao existe `PrevisaoReceitaLdo` nem `PrevisaoDespesaLdo`** neste repositorio. Os nove
models da LDO sao o tramite, as prioridades (meta fisica), as metas anuais e os anexos da
LRF. A LDO daqui nao orca por natureza de receita nem por dotacao.

Isso nao e defeito desta unidade e nao se conserta dentro dela: criar a previsao da LDO e
outra capacidade (5.9.2.6/.7), com importacao, e ela precisa decidir antes se a previsao da
LDO e a mesma entidade da LOA ou outra. Pendencia: **`LDO-SEM-PREVISAO-ORCAMENTARIA`**. A
consequencia para C13 e direta e fica marcada como tal: do lado da LDO, o que esta unidade
versiona e a **meta fiscal**, nao a dotacao.

## O terceiro achado: quem le o valor alterado

Se o ajuste fica so no comparativo, o sistema passa a ter **duas verdades** sobre a mesma
meta: a tela nova mostra a alterada e o Anexo de Metas Fiscais em PDF continua imprimindo a
original. Medido: dois leitores da `MetaAnualLdo` existem hoje —
`lib/portas/anexos-ldo.ts:64` (o anexo em PDF) e
`modules/m02b-plurianual/consultas.ts:metaFiscalDoExercicio` (a meta que o **RREO Anexo 6**
confronta com o resultado apurado).

Os dois passam a ler pelo MESMO dono da derivacao. Com zero atos o numero e identico ao de
hoje — e essa igualdade e o que a suite existente prova, sem alterar nenhuma expectativa.
Deixar o RREO 6 confrontando uma meta que a lei ja mudou seria publicar cumprimento de
meta revogada.

## O que esta unidade constroi

1. `AtoDeAlteracaoDoPlanejamento` — a lei/decreto que altera UMA peca (PPA ou LDO, nunca as
   duas: CHECK de exatamente um alvo), com numero, ano, data, data de publicacao e o
   fundamento em texto.
2. `AlteracaoDeValorPlanejado` — o item append-only: um alvo, uma grandeza, um ajuste COM
   SINAL, uma justificativa. CHECK unico que amarra as duas coisas ao mesmo tempo: exatamente
   um alvo preenchido E a grandeza pertencendo aquele alvo.
3. Os guards do servico, reimpondo no valor derivado os predicados dos cinco CHECKs, e um a
   mais que o banco nao pode ter: o ato do PPA nao altera linha da LDO (cruza tabelas).
4. O dono da derivacao, e os dois leitores existentes passando por ele.
5. O comparativo: original, os atos em ordem cronologica, a soma e o atual, com **corte por
   data** (5.9.1.18 / 5.9.2.10) — e o corte e o que faz "relatorio por versao".
6. Uma acao nova no censo, `ALTERAR_PLANEJAMENTO`, para dois servicos: quem digita a peca
   nao e quem assina a lei que a altera.
7. Tela e percurso.

## O que esta unidade NAO faz — nomeado, nao esquecido

- **Emenda parlamentar** (5.9.1.21/.23, 5.9.2.11/.13, 5.9.3.13/.15): o cadastro com vereador
  e texto juridico, o bloqueio de dotacao inemendavel e a sancao PARCIAL. A sancao parcial e
  a parte dificil — ela exige que o item nasca pendente e so passe a valer quando sancionado,
  isto e, um rito, nao um ajuste. Pendencia: **`EMENDA-PARLAMENTAR-COM-SANCAO-PARCIAL`**.
- **Importacao de peca anterior** (5.9.1.5/.7/.9/.10, 5.9.2.5/.6/.7). Copia, nao versao.
- **Compatibilizar PPA -> LDO -> LOA** (5.9.1.25): replicar automaticamente a alteracao do
  PPA nas outras duas pecas. Ela pressupoe o vinculo PPA->LOA, que o `MODULO.md` ja registra
  como ausente (`VINCULO-PPA-LOA`) por nao estar decidido se a amarracao e por `Acao` ou por
  `AcaoPpa`. Nao se replica o que nao se sabe onde ligar.
- **Versao NOMEADA** ("versao 2 - proposta", "versao 3 - sancionada"). O que existe e o
  estado ate um ato ou ate uma data. Nomear versoes sem que elas signifiquem algo no rito
  seria rotulo sem consequencia. Pendencia: **`VERSAO-NOMEADA-DA-PECA`**.
- **Todas as consultas por versao** (a segunda metade de 5.9.1.30 e 5.9.2.18): os oito
  anexos da LDO e as telas do PPA continuam mostrando o vigente, nao o de uma data passada.
  So o comparativo aceita o corte. Pendencia: **`CONSULTA-POR-VERSAO-NAS-DEMAIS-TELAS`**.
- **Alterar meta FISICA**: `ALTERACAO-DE-META-FISICA`, acima.
