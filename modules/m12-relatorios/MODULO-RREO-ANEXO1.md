# M12 — RREO Anexo 1: Balanço Orçamentário

**LRF art. 52** · **MDF/STN** (Manual de Demonstrativos Fiscais) · Siconfi.

O Anexo 1 do Relatório Resumido da Execução Orçamentária — **bimestral**, publicado a cada dois
meses. Receitas por categoria × origem × espécie; despesas por categoria × grupo de natureza.

## 1. NÃO é o Anexo 12 — e a diferença é o corte

Já existe `balancoOrcamentario` (Anexo 12, **anual**, Lei 4.320) — mas ele corta por **`criadoEm`**
(o instante do encerramento). O RREO Anexo 1 é bimestral e corta pela **data do FATO**
(`dataArrecadacao`, `empenho.data`, `liquidacao.data`, `pagamento.data`): o bimestre é uma janela
de dois meses, e o que entra é o que **aconteceu** ali, não o que foi digitado (doutrina do RREO).
Os cortes são incompatíveis, então este leitor **nasce ao lado**, não estende.

## 2. Leitura pura, composta

Zero escrita, zero aritmética nova (grep-teste t8). A receita vem do `arrecadadoPorNaturezaFonte`
(M04, já corta por data do fato, já é líquida de anulações); a despesa agrega empenhos/liquidações
por grupo com `somaLiquidaEstornaveis` (o líquido de sempre). A **única** mudança fora do módulo:
`arrecadadoPorNaturezaFonte` ganhou `desde?` opcional (+13/−2), para separar "No Bimestre (b)" de
"Até (c)" — uma aritmética, um recorte novo (o padrão do `somasPorConta`).

## 3. As cinco identidades auto-executáveis

| id | o que amarra | teste |
|---|---|---|
| **R1** | SALDO == (a) − (c), por linha | t1 (102.000 = 120.000 − 18.000) |
| **R2** | Σ espécies == origem == categoria (a A3/L2 da família) | t1, t4 (nos dois quadros) |
| **R3** | (c) do bim N == (c) do N−1 + (b) do N | t2 (40.000 = 18.000 + 22.000) |
| **R4** | 6º bim: empenhada == liquidada + RPNP (amarra **M05 × M08**) | t5 (30.000 = 10.000 + 20.000) |
| **R5** | Σ receitas realizadas − despesas == superávit − déficit | t6 |

**R4 é a mais forte:** o RPNP é lido de `InscricaoRestosAPagar` (M08), não derivado de
empenhada−liquidada (M05). Assim a identidade **cruza os dois módulos** — se o encerramento do M08
inscrever um valor diferente do que o M05 deixou sem liquidar, R4 grita.

## 4. As regras de forma do MDF/Siconfi

- **Receitas líquidas de deduções** — a dedução (tipo `DEDUCAO` na previsão) subtrai; a anulação
  subtrai na arrecadação (`sinalDaReceitaRealizada`).
- **Intra em tabela separada** (categorias 7/8), ao final, mesmo desdobramento (t4).
- **Saldos de Exercícios Anteriores** — só nas colunas (a) e (c), o montante dos créditos abertos
  por superávit financeiro (`itemCredito` de decreto `SUPERAVIT_FINANCEIRO` — a mesma fonte do
  Anexo 12, cf765b0). t3.
- **Déficit × superávit** — nunca os dois com valor (o demonstrativo equilibra por **um** lado). E
  a régua da despesa **troca no 6º bimestre**: liquidada nos bimestres 1-5, **empenhada** no 6º
  (MDF). t6 prova com um cenário onde as duas réguas **divergem** (empenhada 40.000 ≠ liquidada
  10.000).
- **%(x/a)** arredondado a 2 casas (Siconfi) — t2 (33,333… → 33,33).
- **Decimal string** em toda saída.

## 5. Passo 0

- **(a)** categoria/origem têm Record (`CATEGORIAS_RECEITA`/`ORIGEM_RECEITA`); a **espécie (3º
  dígito) não tem rol oficial** — o parser a devolve crua, então o rótulo é o código de 3 dígitos
  (não invento nome que a norma não fixa).
- **(b)** `arrecadadoPorNaturezaFonte` já corta por data do fato e é líquido; **estendido** com
  `desde?` para a janela do bimestre.
- **(c)** grupo = `NaturezaDespesa.codNatureza` (2º dígito); rol MCASP colado no código
  (`GRUPOS_DESPESA`).
- **(d)** RPNP lido de `InscricaoRestosAPagar` (M08) → R4 vira amarração real.
- **(e)** Saldos de Exercícios Anteriores = créditos por superávit (mesma fonte do Anexo 12).

## 6. Pendências nomeadas

- **Reprevisão de receita** — "PREVISÃO ATUALIZADA (a)" = inicial + reestimativas, e a tabela de
  reestimativas está **vazia** (atualizada == inicial hoje). Ela ganha o seu consumidor quando o
  bloco de reprevisão nascer; até lá o número não mente (não há reestimativa a somar).
- **Dedução como redutora MCASP** — a dedução via linha redutora própria (ex. FUNDEB) não é
  modelada; o net-de-anulações é o líquido operante. Mesma família da reprevisão.
- **Intra na despesa** — a intra-despesa (modalidade 91) não é desdobrada aqui. ⚠️ **RESOLVIDA no
  Anexo 2:** o RREO Anexo 2 (`rreo-anexo2.ts`) fecha essa lacuna — a intra-despesa é `codModalidade
  == "91"`, e aparece na tabela (II) dele. Decisão cruzada: a intra-**receita** é do Anexo 1
  (categorias 7/8); a intra-**despesa** é do Anexo 2 (modalidade 91). Ver `MODULO-RREO-ANEXO2.md`.
