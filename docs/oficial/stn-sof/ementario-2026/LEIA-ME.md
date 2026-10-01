# Ementário da Classificação por Natureza de Receita — Tabela de Códigos, válida para 2026 (STN)

| Campo | Valor |
|---|---|
| Arquivo | `ementario-receita-tabela-de-codigos-2026.xlsx` (não editado) |
| URL | https://thot-arquivos.tesouro.gov.br/publicacao-anexo/27870 |
| Página de origem | https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/federacao/ementario-da-classificacao-por-natureza-de-receita-tabela-de-codigos ("Ementário - Tabela de Códigos - válido para 2026") |
| Norma | Portaria STN nº 1.458, de 4/7/2025; Portaria Conjunta STN/SOF nº 2, de 13/3/2026 |
| Exercício | 2026 |
| Consulta e download | 01/10/2026 |
| SHA256 | `97cd8bd31da8d5e5d62174d4296c779df4cf7bb89db0eb58c701c7035f6eeffa` |

Abas: `Tabelas`, `ENR - 2026` (1.728 linhas), `Alterações - ENR 2025`, `Alterações ENR - 2026`.

## Por que este é o rol do TCE-PB

O leiaute SAGRES Contabilidade 2026 v1.1 (`docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html`),
tabela de domínio `CodigoReceitaOrcamentaria`: "Definido pela Secretaria do Tesouro Nacional e
disponibilizada pela Matriz de Saldos Contábeis - MSC". Não há rol próprio do Tribunal.

## Linhas usadas pela V26 (coluna NR, aba `ENR - 2026`, transcrição literal)

| NR | Especificação |
|---|---|
| 11130300 | Imposto sobre a Renda - Retido na Fonte |
| 11130310 | Imposto sobre a Renda - Retido na Fonte - Trabalho |
| 11130340 | Imposto sobre a Renda - Retido na Fonte - Outros Rendimentos |
| 11145100 | Impostos sobre Serviços |
| 11145110 | Imposto sobre Serviços de Qualquer Natureza - ISSQN |
| 11180230 | Imposto sobre Serviços de Qualquer Natureza |
| 11130110 | Imposto sobre a Renda de Pessoa Física - IRPF |

A tabela publica o código até o 7º nível terminado em zero; o último dígito é o **tipo** (aba `Tabelas`,
7º nível): 1 principal, 2 multas e juros, 3 dívida ativa, 4 multas e juros da dívida ativa. Daí
11130311, 11130341 e 11145111 como o principal de cada um. Os agregadores (final 0) não são lançáveis.

**O ISSQN aparece em duas estruturas na mesma tabela de 2026**: 1.1.1.4.51.1 (`11145110`) e
1.1.1.8.02.3 (`11180230`), nenhuma marcada como excluída (sem tachado na planilha; conferido no estilo da
célula). O extrato de impostos usado pelo sistema desde a 7.9 (`prisma/seed/dados/depara-impostos.test.ts`)
traz `11180231`. A ordem V26 adota `11145111` para o ISS retido. Por isso a natureza de cada retenção
própria é **cadastro do ente** (`/financeiro/retencoes-proprias`), conferida contra o ementário dele —
não constante no código.

## O que NÃO foi baixado

A LOA 2026 de Esperança (Lei 613/2025, Anexo II) e o demonstrativo de MDE: os valores das deduções e a
rubrica de IRPF `11130101` vêm do texto da ordem V26 (`docs/lotes/V26-decisoes-da-v25.md`, 2.5 e 1.2),
não de arquivo baixado nesta rodada. Não há SHA256 para eles. O código `11130101` não consta do
ementário STN 2026 (que traz `11130110` como IRPF, final 0, agregador do 7º nível).
