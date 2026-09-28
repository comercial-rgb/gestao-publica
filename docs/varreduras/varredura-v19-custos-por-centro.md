# Varredura V19 — a apropriacao de custo por centro (C05)

Levantada em 2026-09-28, antes de escrever codigo. Numeros medidos, nao lembrados.

## O pedido

`docs/lotes/V14-contabilidade-esperanca-dois-dias.md:97`:

> | C05 | Geral: centros de custos | Acumular registros e distribuir custos quando aplicavel por
> programa/unidade/centro | **Composicao rastreavel sem lancar novamente a mesma despesa** |

E o contrato de engenharia da mesma ordem (secao 5.6) e mais exigente que a linha da matriz:

> Cadastro de centro de custo em pessoal **nao comprova** acumulacao contabil por centro. O fato ou
> apropriacao rastreavel **deve alcancar os relatorios**. Criterio de distribuicao tem **versao,
> base e tratamento do residuo**; custo **nao e necessariamente o mesmo instante do desembolso**.

O cenario de apresentacao (secao 10, F) da o numero: *"Apropriar um custo elegivel de 1.000,00 a
dois centros, 600,00 e 400,00: composicao deve retornar ao fato, sem nova despesa."*

## O que JA existe — e o levantamento anterior errou aqui

Um inventario desta sessao concluiu "AUSENTE: nao existe modelo, nem servico, nem rateio" porque
procurou `CentroDeCusto` em `m01`, `m05`, `m10` e `m12`. Medido de novo, com o termo certo:

| Peca | Onde | O que e |
|---|---|---|
| a DIMENSAO centro de custo | `HistoricoVinculo.centroDeCustoId -> Setor` (`m32-pessoal.prisma:680`) | **e o `Setor`**, por decisao registrada: *"em vez de num quarto organograma"* (`m21-protocolo.prisma:89`) |
| a VIGENCIA dela | `centroDeCustoVigenteEm(eventos, quando)` (`m32-pessoal/dominio.ts:264`) | o centro de custo de um vinculo em UMA data — evento `MUDANCA_CENTRO_DE_CUSTO`, historico versionado |
| o eixo de RELATORIO | `eixos.centroDeCustoIds` (`m32-pessoal/dominio.ts:640`) | os relatorios de PESSOAL ja filtram por centro de custo |
| a apropriacao da FOLHA | `apropriarFolha` (`m33-folha/apropriacao.ts:606`) | existe, e agrupa por **GRUPO** (ficha + contas), **nao** por centro de custo |

Ou seja: a dimensao existe, tem historico, e ja e eixo de relatorio de pessoal. **Nao se cria um
quarto organograma** — seria a quarta verdade sobre a estrutura do ente.

## O que falta, exatamente

1. **Apropriar custo de um fato que NAO e folha.** O cenario fala de "um custo elegivel": a despesa
   ja reconhecida. Nao existe nada que distribua uma liquidacao entre centros.
2. **O criterio de distribuicao com versao, base e residuo.** Nao existe modelo de criterio.
3. **O relatorio de custo por centro** — "deve alcancar os relatorios". O eixo existe para pessoal;
   para custo acumulado, nao existe saida nenhuma.

## As tres decisoes de modelo

### 1. O centro de custo e o `Setor`. Nao ha cadastro novo.

A alternativa (um model `CentroDeCustoContabil` proprio) foi recusada: ela criaria um segundo
organograma a manter em dia com o primeiro, e o dia em que divergissem ninguem saberia qual vale. O
`Setor` ja pertence a uma `UnidadeOrcamentaria`, o que da de graca o recorte por unidade que a
matriz pede ("por programa/unidade/centro").

### 2. A apropriacao NAO lanca no razao — e e isso que a prova de C05 exige

*"Composicao rastreavel sem lancar novamente a mesma despesa."* A despesa foi reconhecida na
liquidacao, com as partidas dela. Lancar a apropriacao no razao duplicaria a VPD: o custo apareceria
duas vezes no resultado. A apropriacao e uma **dimensao gerencial sobre um fato que ja existe** —
ela referencia a liquidacao, nao a repete.

⚠️ E ISSO TEM UMA CONSEQUENCIA QUE FICA DITA: o total apropriado NAO e uma conta do PCASP e nao
aparece em balancete. Ele aparece no relatorio de custos, que soma as apropriacoes — e o teste
afirma que nenhum `LancamentoContabil` e criado.

### 3. O criterio tem versao, base e residuo — porque a ordem exige os tres

| Campo | Por que |
|---|---|
| `versao` + `vigenteDesde` + `atoRef` | mesmo padrao do `RoteiroOrcamentario` e do CMD: retificar e publicar versao nova, a anterior fica. Um criterio editavel reescreveria a historia do custo ja apropriado |
| `base` | o que se rateia: `PERCENTUAL_DECLARADO` (o ente diz 60/40). ⚠️ E UM ROL DE UM SO VALOR de proposito — `AREA_CONSTRUIDA`, `NUMERO_DE_SERVIDORES` e afins exigem cadastros que este repositorio nao tem, e um enum com valores que nenhum servico sabe calcular seria promessa em tabela |
| `centroDoResiduo` | o rateio de 1.000,00 em tres centros iguais da 333,33 tres vezes e sobra um centavo. O residuo vai ao centro DECLARADO, nao ao ultimo da lista por acidente |

## O que esta unidade constroi

1. `CriterioDeRateioDeCusto` + `ItemDoCriterioDeRateio` — versionado, com base e centro do residuo.
2. `ApropriacaoDeCusto` + `ItemDaApropriacaoDeCusto` — o fato, referenciando a LIQUIDACAO e com
   **competencia propria** (a ordem diz: custo nao e o instante do desembolso).
3. O servico `apropriarCustoDaLiquidacao`, com os guards: soma dos itens igual ao valor apropriado,
   valor apropriado nao excede o **liquido** da liquidacao (net de estorno), e a mesma liquidacao
   nao se apropria duas vezes pelo mesmo criterio.
4. A consulta `custoPorCentro` e a `composicaoDoCentro` — que volta ao fato.
5. Tela, percurso, catalogo.

## O que esta unidade NAO faz

- **Ratear a FOLHA por centro de custo.** `apropriarFolha` agrupa por grupo/ficha, e mudar aquele
  agrupamento mexeria no empenho da folha — outra unidade, com outro risco. Pendencia
  `FOLHA-SEM-RATEIO-POR-CENTRO`.
- **Bases de rateio calculadas** (area, headcount, horas). Pendencia `BASE-DE-RATEIO-CALCULADA`.
- **Custo por PROGRAMA e por ACAO.** A matriz cita "programa/unidade/centro"; o `Setor` da unidade e
  centro. Programa e acao sao dimensoes da ficha, e o custo por programa sai de outra consulta —
  nao construida aqui. Pendencia `CUSTO-POR-PROGRAMA`.
- **Apropriar custo de patrimonio (depreciacao) por centro.** Pendencia `DEPRECIACAO-SEM-CENTRO`.

---

## O que a construcao mediu, depois da varredura (fechamento)

Tres coisas que a varredura nao previu, e que so apareceram construindo:

1. **`toMoney` achatava o percentual.** O contrato de dinheiro arredonda a DUAS casas, e percentual
   e `Decimal(9,6)` desde o `_base.prisma`. O primeiro `zPercentual` deste modulo era
   `zMoney.refine(...)`: 33,333333 % virava 33,33 %, tres partes iguais somavam 99,99 e a publicacao
   era RECUSADA por nao fechar em 100 — recusada pelo contrato, culpando o usuario. Nasceu
   `packages/contracts/percentual.ts`, com dois testes de CONTRASTE que afirmam o que o contrato
   errado fazia. E a mesma leitura errada existe no M10 (`percentualResidual`): pendencia
   `PERCENTUAL-RESIDUAL-LIDO-COM-DUAS-CASAS`.
2. **O percurso reprovou dois passos por CAIXA, nao por comportamento.** `irPara` devolve o texto da
   pagina em minusculas (`percursos-navegador.ts:52`), e `texto.includes("Rateio do percurso ...")`
   nunca casava. Falso vermelho, com a tela certa. O percurso passou a comparar em minusculas, com o
   motivo escrito ao lado da constante.
3. **O passo do TETO passava pelo caminho facil.** Apropriando a liquidacao por INTEIRO, ela sai do
   rol e a segunda tentativa nunca acontece — o guard do teto nao era exercitado por tela nenhuma.
   O passo 7 passou a usar uma SEGUNDA liquidacao (N=2), apropriar uma parte e so depois pedir um
   absurdo: e ai que a recusa "acima da despesa" e medida de verdade.

## O catalogo: C05 nao tem clausula propria, e isso foi medido

Busca no catalogo por "centro de custo" (32 clausulas), "rateio" e "apropriar/apropriacao" (5).
Nenhuma enuncia "acumular registros e distribuir custos por programa/unidade/centro". As 32 sao de
PESSOAL (folha, ponto, EPI, treinamento), de COMPRAS, de ALMOXARIFADO e de AUDITORIA — eixos que ja
existem e nao sao o acumulo contabil. C05 vem da matriz da ordem, que e mais exigente que o edital
aqui.

A unica adjacente e a **5.10.1.13** ("apropriar mes a mes assinaturas e seguros, com os respectivos
lancamentos contabeis"), e ela pede o OPOSTO: diferimento de despesa antecipada, cujo ponto E o
lancamento. Marcada `AUSENTE_CONFIRMADO` com a distincao escrita — pendencia
`APROPRIACAO-MENSAL-DE-DESPESA-ANTECIPADA`.

## Resultado medido

- `modules/m12-relatorios/m12-custos-por-centro.test.ts` — **17/17**
- `packages/contracts/percentual.test.ts` — **7/7**
- `scripts/smoke-custos-por-centro.ts` — **22/22, 0 falhas** (clone descartavel
  `gestao_publica_custos_v19b`, `next start` sobre build proprio na 3011, build `COrWq8o0a_EyjtZ8x2tgc`)
- mutacao provada nas duas direcoes: residuo, teto e o lancamento a mais (ver a mensagem do commit)
- `npm run deriva` — 32 statements, a deriva pre-existente, inalterada
