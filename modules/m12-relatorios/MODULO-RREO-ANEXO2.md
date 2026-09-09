# M12 — RREO Anexo 2: Despesa por Função/Subfunção

**LRF art. 52, II** · **MDF/STN 15ª edição** (Portaria STN/MF 2.057, vigente 2026) ·
**Portaria MOG 42/1999** (classificação funcional).

O Anexo 2 olha a **mesma** despesa que o Anexo 1, por outro eixo: a **classificação funcional**
(função × subfunção) em vez da econômica (categoria × grupo). Mesmo universo, mesmo corte pela
**data do fato** (`empenho.data`, `liquidacao.data` — nunca `criadoEm`, a lição do Anexo 1), dois
caminhos de leitura.

## 1. Nasce ao lado, e a A1 é a amarração

Não reuso o `montarDespesas` do Anexo 1 (privado, fixa o agrupamento econômico), e a regra do
bloco é **não tocar o Anexo 1** — confirmado: `git diff` do `rreo-anexo1.ts` é vazio, os 798 testes
anteriores intactos. Em vez de refatorar, a **identidade A1** confronta os dois: o TOTAL (III) do
Anexo 2 tem de bater, coluna a coluna, com a despesa do Anexo 1. Duas leituras independentes do
mesmo razão — se divergirem, A1 grita (t2, t7). É a confrontação de duas fontes, não a duplicação
de uma.

## 2. As cinco identidades

| id | o que amarra | teste |
|---|---|---|
| **A1** | TOTAL(III) por coluna == despesa do Anexo 1 (funcional × econômica) | t2, t7 |
| **A2** | Σ subfunções == função; Σ funções + Reserva == (I) | t3 |
| **A3** | (c) == (a) − (b até); (e) == (a) − (d até) | t1, t7 |
| **A4** | Σ(f) == Σ InscricaoRestosAPagar == (f) do Anexo 1 — **M05 × M08 × funcional** | t5 |
| **A5** | "até o bim N" == Σ "no bim" 1..N | t6 |

## 3. As decisões do Passo 0

### Reserva de Contingência = `codCategoria == "9"` (não função 99/999)

A Reserva **não** é modelada como função 99/999 nem flag — o grep provou. O sinal que **já
existe** no repo é a **categoria econômica 9** (o Anexo 12, `dominio.ts`, identifica assim:
`if (cod === "9") return "RESERVA DE CONTINGÊNCIA"`). Adoto o mesmo: **ficha cuja
`NaturezaDespesa.codCategoria == "9"` é Reserva.** Ela vai em linha própria, preenche **só**
dotação (inicial/atualizada) e saldos (c)(e) — não se empenha nem se liquida (enquanto reserva,
não há execução; ela é remanejada via crédito). **Rol fechado: `{"9"}`** — cresce por decisão.

### Modalidade de aplicação 91 = intra — e é DERIVÁVEL

`NaturezaDespesa.codModalidade` é **coluna** (`VarChar(2)`). Intra = `codModalidade == "91"`, direto
do dado. Por isso a linha **(II) DESPESAS INTRAORÇAMENTÁRIAS não nasce zero** — é populada de
verdade (t4). **Não há pendência "intra-modalidade-91"** — a informação estava no schema.

> ⚠️ **Decisão cruzada com o Anexo 1:** o Anexo 1 desdobra a intra da **receita** (categorias 7/8,
> tabela separada) mas **deixou a intra da despesa fora** ("modalidade 91, bloco de consolidação
> futuro"). O Anexo 2 **fecha essa lacuna na despesa**: a intra-despesa é a modalidade 91, e ela
> aparece na tabela (II). Os dois documentos apontam um para o outro — a intra-despesa é do Anexo
> 2; a intra-receita é do Anexo 1.

### Rótulos oficiais, não inventados

`Funcao` e `Subfuncao` têm `nome` no schema (Portaria 42/1999, semeado pelo ente). Uso
`funcao.nome`/`subfuncao.nome` como rótulo — diferente da espécie do Anexo 1 (que não tinha rol e
usou o código cru). Aqui o rol existe.

### Subfunções atípicas — sem guard

Uma subfunção pode ser **atípica** (combinada com função diferente da vinculação da Portaria 42).
O Anexo 2 **reporta o que a ficha declara**, sem guard de tipicidade — o demonstrativo espelha a
execução, não a corrige.

## 4. Passo 0, ponto a ponto

- **(a)** funcional na ficha (`funcaoId`/`subfuncaoId`), com `nome` oficial; agrego por
  função→subfunção (não resolvo por lançamento como o MSC).
- **(b)** Reserva = `codCategoria == "9"` (precedente do Anexo 12).
- **(c)** modalidade 91 derivável de `codModalidade` (coluna) — intra populada.
- **(d)** fatos lidos frescos, corte idêntico ao Anexo 1; A1 confronta os totais.
- **(e)** dotação atualizada = `valorDotado` + créditos (M03), mesma query; a lazy-creation do
  `DOTACAO_INICIAL` não afeta (leio `valorDotado`, não o movimento).
