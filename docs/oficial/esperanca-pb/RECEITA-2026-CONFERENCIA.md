# Receita prevista da LOA 2026 de Esperança: extração e conferência

**Documento:** Lei Ordinária 613, de 19/12/2025 (`lei-613-2025-loa-2026.pdf`, sha256
`43e84beacbc5f4de47949d2fac4356c40ecbca7a5f4a2bb38df0bff7e982b236`). **Derivado:**
`receita-prevista-2026-DERIVADO.csv`, sha256 `9d5adff359d008895513723d90d3a778d6b5e900bf8d254346c373be5218823e`.
Conferido em 04/10/2026. As linhas citadas são do texto `pdftotext -raw -enc UTF-8`, o mesmo usado em
`QDD-2026-CONFERENCIA.md`.

## Já havia carga equivalente? Não.

- `scripts/demonstracao/prever-receita-da-loa.ts` não lê nem o PDF nem o texto. É da LOA de demonstração da V22:
  prevê quatro impostos com valores fixos no código (IPTU 180.000,00, ITBI 60.000,00, ISSQN 220.000,00 e IRRF
  50.000,00, todos na fonte 500), com o autor `admin@cg.pb.gov.br`, só para equilibrar a despesa de demonstração de
  660.000,00. Ele não tem relação com a Lei 613/2025 e não pode ser conferido contra o art. 2º. Nada foi duplicado.
- `scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts` traz, escritas no código, as quatro linhas de
  dedução já conferidas em `loa-2026-deducoes.md`. O CSV novo reproduz essas quatro linhas exatamente: a conferência
  abaixo lê o `.md` e compara.
- A receita prevista completa da lei não tinha derivado. Este é o primeiro.

## Extração

```
export PATH=/mingw64/bin:$PATH
node scripts/fontes/extrair-receita-esperanca-2026.mjs     # gera o CSV
node scripts/fontes/conferir-receita-esperanca-2026.mjs    # conferência independente
```

- Fonte: Anexo II "RESUMO GERAL DA RECEITA", linhas 383–893. Só entram as **66 linhas analíticas**: código de 10
  dígitos + fonte de 3 dígitos + receita + dedução. As linhas sintéticas (`---`) não entram, porque são somas.
- Colunas: `natureza;descricao;fonte;valor;deducao;tipo_deducao;natureza_lei`.
  - `natureza`: os 8 primeiros dígitos (`17115111`).
  - `natureza_lei`: o código como a lei imprime (`1.7.1.1.51.1.1.00`). Coluna extra, para não perder o
    detalhamento local.
  - `valor`: a receita bruta.
  - `deducao`: o valor absoluto do que a lei imprime com sinal negativo. Uma dedução positiva interromperia a
    extração.
  - `tipo_deducao`: `3` (dedução para o Fundeb) nas 4 linhas com dedução e vazio nas demais. O extrator só preenche
    o `3` porque a soma das deduções do anexo (13.517.240,00) é igual ao "4.1 - Total Destinado ao FUNDEB (Deduções
    Cadastradas no Sistema)" do demonstrativo da MDE (linha 5605). Se não fosse, ele pararia.
- `descricao` é a da linha analítica, como impressa: o `?` no lugar do travessão e os cortes de texto do sistema
  emissor ficam como estão (por exemplo, "...Profissionai", "...Princi").
- **Atenção para quem carregar:** com 8 dígitos, `natureza` + `fonte` não identificam a linha sozinhas. A lei tem
  duas linhas `17115121` na fonte 500: `1.7.1.1.51.2.1.00` (1% de dezembro, 2.533.000,00) e `1.7.1.1.51.2.1.02`
  (1% de setembro, 2.100.000,00). A chave única é `natureza_lei` + `fonte`.
- **Valores zero:** 4 linhas têm receita 0,00, todas como impressas. São a Aldir Blanc nas fontes 715 e 716 e a Lei
  Paulo Gustavo nas fontes 715 e 716. As fontes 715 e 716 não aparecem no consolidado por fonte da lei.
- **Fontes que chamam atenção, como impressas e sem ajuste:** a natureza `2.4.2.2.51.0.1.00` (convênios dos
  Estados para educação) tem uma linha na fonte 632 (convênios do Estado vinculados à **saúde**, 1.628.000,00). A
  natureza `2.4.1.4.99.0.1.00` (convênios da **União**) tem uma linha na fonte 701 (convênios dos **Estados**,
  1.260.600,00). Isso é o que a lei diz e pode ser erro de classificação dela. Fica registrado, não corrigido.

## Totais

| | Valor |
|---|---:|
| Receita bruta (soma de `valor`) | 258.517.240,00 |
| Deduções (soma de `deducao`) | 13.517.240,00 |
| **Receita líquida** | **245.000.000,00** |

A receita líquida é igual ao TOTAL GERAL do art. 2º, ao "Total Geral das receitas (Orçamentárias +
Intra-Orçamentárias)" do Anexo II (linha 893) e à despesa fixada.

## Conferência: resultado

Nenhuma diferença. A conferência não importa o extrator.

| Comparação (soma do CSV × impresso na lei) | Itens | Iguais |
|---|---:|---:|
| Anexo II: cada linha sintética (`---`), receita, somando o CSV pelo prefixo do código | 257 | 257 |
| Anexo II: cada linha sintética, dedução | 257 | 257 |
| Anexo II: "Total da Categoria Econômica (receitas - deduções)", nas categorias 1, 2, 7 e 8 (209.321.434,10 / 9.766.965,90 / 25.911.600,00 / 0,00) | 4 | 4 |
| Anexo II: Total da Lei Orçamentária (219.088.400,00), da Lei Intra-Orçamentária (25.911.600,00) e Total Geral (245.000.000,00) | 3 | 3 |
| Art. 2º, itens 1.1 a 1.6, 2.1, 3.1, os três subtotais e o TOTAL GERAL (linhas 100–121) | 12 | 12 |
| Consolidado das receitas e despesas por fonte: Receitas (a), contra a receita líquida do CSV por fonte | 32 | 32 |
| Deduções de `loa-2026-deducoes.md`: receita, dedução e tipo 3 das 4 naturezas | 12 | 12 |

O art. 2º imprime "1.4 TRANSFERÊNCIAS CORRENTES 204.895.546,50" bruto e "1.6 DEDUÇÃO -13.517.240,00" à parte. O
CSV dá 204.895.546,50 para o grupo 1.7 e 13.517.240,00 de dedução.

Para mostrar que a conferência detecta erro, alterei uma cópia do CSV, e cada alteração foi apontada:

- +0,01 numa receita: 15 diferenças.
- Fonte 500→751 numa linha: as fontes 500 e 751 divergem.
- `tipo_deducao` apagado no ICMS: a comparação com o `.md` diverge.
- `natureza_lei` incoerente com `natureza`: a conferência para com erro.
