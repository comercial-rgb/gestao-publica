# LOA 2026 de Esperança — deduções da receita prevista

**Documento:** Lei Ordinária 613, de 19/12/2025 — `lei-613-2025-loa-2026.pdf` nesta pasta (origem, data de obtenção e
SHA256 em `MANIFEST-LOA-2026.json`; hash conferido contra o informado na ordem V27). Conferência feita em 01/10/2026
sobre o texto extraído (`pdftotext -raw` e `-layout`: as duas extrações dão os mesmos pares natureza/valor; a
`-layout` desloca colunas e não serve para ler valores).

| Natureza na lei | Natureza (8 dígitos) | Descrição | Fonte | Receita | Dedução no Anexo II | Tipo no Tribunal |
|---|---|---|---|---:|---:|---|
| 1.7.1.1.51.1.1.00 | 17115111 | FPM — Cota Mensal — Principal | 500 | 50.737.500,00 | 10.147.500,00 | 3 — dedução para o Fundeb |
| 1.7.2.1.50.0.1.00 | 17215001 | Cota-Parte do ICMS — Principal | 500 | 14.702.600,00 | 2.940.300,00 | 3 — dedução para o Fundeb |
| 1.7.2.1.51.0.1.00 | 17215101 | Cota-Parte do IPVA — Principal | 500 | 2.141.700,00 | 427.900,00 | 3 — dedução para o Fundeb |
| 1.7.2.1.52.0.1.00 | 17215201 | Cota-Parte do IPI — Municípios — Principal | 500 | 7.700,00 | 1.540,00 | 3 — dedução para o Fundeb |
| | | **Total** (art. 2º, "1.6 Dedução das transferências correntes") | | | **13.517.240,00** | |

**Resultado da conferência:** as quatro linhas carregadas por
`scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts` são iguais às do PDF, natureza por natureza e valor
por valor. Nada mudou na carga.

## O que não se carrega, e por quê

- **Tipos 4 e 5:** o anexo não traz dedução não nula desses tipos. Nenhuma linha é criada para cobrir a tabela do
  Tribunal.
- **ITR** (1.7.1.1.52.0.1.00, receita 55.500,00): consta com dedução **0,00** no Anexo II. Os 20% não são
  preenchidos automaticamente.

## Divergência registrada, não corrigida: R$ 11.760,00

O demonstrativo da MDE da mesma lei calcula o total destinado ao Fundeb pela fórmula do próprio quadro:
"4 - TOTAL DESTINADO AO FUNDEB - 20% DE ((2.1.1)+(2.2)+(2.3)+(2.4)+(2.5)+(2.7))" = **13.529.000,00**. Na linha
seguinte vem "4.1 - Total Destinado ao FUNDEB (Deduções Cadastradas no Sistema)" = **13.517.240,00**, que é o
Anexo II.

| Base no quadro da MDE | Valor | 20% | Dedução no Anexo II | Diferença |
|---|---:|---:|---:|---:|
| 2.1.1 FPM (art. 159, I, b) | 50.737.500,00 | 10.147.500,00 | 10.147.500,00 | 0,00 |
| 2.2 ICMS | 14.702.600,00 | 2.940.520,00 | 2.940.300,00 | 220,00 |
| 2.3 IPI-Exportação | 7.700,00 | 1.540,00 | 1.540,00 | 0,00 |
| 2.4 ITR | 55.500,00 | 11.100,00 | 0,00 | 11.100,00 |
| 2.5 IPVA | 2.141.700,00 | 428.340,00 | 427.900,00 | 440,00 |
| 2.7 Compensações | 0,00 | 0,00 | — | 0,00 |
| **Total** | 67.645.000,00 | **13.529.000,00** | **13.517.240,00** | **11.760,00** |

A diferença decompõe-se exatamente em ITR sem dedução (11.100,00), ICMS (220,00) e IPVA (440,00). A carga usa o
Anexo II, que é a previsão aprovada por natureza. A LOA não é recalculada para fechar a diferença. Se a dedução do
ITR e os centavos do ICMS e do IPVA deveriam ser outros, isso se corrige por norma (crédito ou alteração da previsão),
não pela carga.

## Carga

`scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts`. É idempotente e fail-closed:
- sem a natureza ou a fonte 500 no cadastro, nada é gravado;
- uma linha que já existe com outro valor para a carga, que não altera nada.
