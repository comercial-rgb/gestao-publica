# QDD da LOA 2026 de Esperança: extração e conferência

**Documento:** Lei Ordinária 613, de 19/12/2025 (`lei-613-2025-loa-2026.pdf` nesta pasta; procedência em
`MANIFEST-LOA-2026.json`). **Derivado:** `qdd-2026-DERIVADO.csv`. Conferido em 04/10/2026.

## Extração

```
# Git Bash; pdftotext (poppler/xpdf 4.06) em /mingw64/bin
export PATH=/mingw64/bin:$PATH
node scripts/fontes/extrair-qdd-esperanca-2026.mjs      # roda: pdftotext -raw -enc UTF-8 lei-613-2025-loa-2026.pdf -
node scripts/fontes/conferir-qdd-esperanca-2026.mjs     # conferência independente (não importa o extrator)
```

Os dois scripts aceitam `--texto <arquivo>` com o texto `-raw` já extraído. O `.txt` versionado nesta pasta veio da
extração **sem** `-raw`. No QDD ele separa os valores das fichas (a partir da linha 3247 do `.txt`: as fichas da Câmara
saem sem valor e os valores aparecem depois, em bloco e fora de ordem). Por isso ele não serve para o QDD e não foi
usado. As linhas citadas abaixo como "linha N" são do texto `-raw` (saída padrão de
`pdftotext -raw -enc UTF-8`). Quando ajuda, cito também a linha do `.txt` versionado.

| Arquivo | sha256 |
|---|---|
| `lei-613-2025-loa-2026.pdf` | `43e84beacbc5f4de47949d2fac4356c40ecbca7a5f4a2bb38df0bff7e982b236` (igual ao do manifesto) |
| texto `-raw` (não versionado, regenerável) | `a731b4b0df5153b9f1057124323123728e5e0f8d11363a47a73a45f3035bbe1c` |
| `qdd-2026-DERIVADO.csv` | `b107dbdcae4d8aaa958e2cd7b37fcfe58aee39e1e62f539ab32ace8218b1e0bc` |

**QDD no texto -raw:** linhas 908–2607 (34 páginas, de "Identificador Classificação Descrição Fonte Valor Total" a
"Total do Orçamento 245.000.000,00").

## O CSV

- **1.054 linhas de dados** mais o cabeçalho. Cada linha é uma ficha orçamentária, o menor nível que o QDD traz.
  O número da ficha é único no arquivo, e o extrator confere isso.
- Colunas: `orgao;unidade_orcamentaria;descricao_unidade;funcao;subfuncao;programa;acao;descricao_acao;natureza_despesa;fonte;valor;ficha;natureza_qdd`.
- **CO:** o QDD não traz código de aplicação/CO. A coluna `co` não existe porque não há dado para ela.
- **`natureza_despesa` no nível de ELEMENTO, com 6 dígitos** (`449052`). O QDD imprime a natureza com 10 dígitos
  (`4.4.90.52.00.00`). Das 1.054 fichas, 1.053 têm desdobramento `00.00`. Uma tem desdobramento próprio:
  ficha **11275**, `3.1.90.04.01.00` "SALARIO CONTRATO TEMPORARIO", unidade 02016, fonte 604, 110.000,00 (linha 2129;
  linha 8694 do `.txt`). Para não perder esse dado, a coluna extra `natureza_qdd` guarda o código como impresso.
- `fonte` tem 3 dígitos, como o QDD imprime (500, 540, ...). São 32 fontes distintas.
- `valor` é texto decimal com ponto e centavos exatos (`217150.00`). Nenhum valor passa por número de ponto flutuante.
  Os scripts somam em centavos com BigInt.
- **Unidade orçamentária com 5 dígitos.** O QDD imprime 4 dígitos (`1001`, `2016`): o primeiro é o poder/órgão
  (1 Legislativo, 2 Executivo) e os outros três são a unidade. O CSV usa `0` + os 4 dígitos (`01001`, `02016`). É o
  código que a própria lei imprime no Anexo IX e no quadro "por unidade orçamentária e função, subfunção, programa e
  ação" (`01001 - CAMARA MUNICIPAL`), e é também o do TCE-PB. `orgao` são os dois primeiros dígitos: `01`
  Legislativo, `02` Executivo. O art. 3º usa outra grafia para a mesma unidade (`10.01`, `20.16`), e a conferência
  converte `P0.UU` em `0P0UU`.
- Uma descrição quebrada em duas linhas no PDF foi juntada: a da ficha 11850, "APOSENTADORIAS DO RPPS, ...", linhas
  2578–2581. A descrição da natureza não vai para o CSV.
- O extrator para com erro em qualquer linha do QDD que não reconheça. Na extração final, ele reconheceu todas.

## Conferência: resultado

O script de conferência lê o CSV como dado. Lê também cada quadro impresso da lei com uma regra própria, e não usa o
extrator. Para mostrar que a conferência detecta erro, alterei uma cópia do CSV de três formas, e cada alteração foi
apontada:

- +0,01 numa ficha: 32 quadros divergem.
- Fonte 500→540 numa ficha: as fontes 500 e 540 divergem nos dois consolidados por fonte.
- Ação 1001→1014 numa ficha: as duas ações divergem no QDD, no quadro por unidade e ação e no consolidado por ação.

Com o CSV verdadeiro:

| Comparação (CSV × impresso na lei) | Chaves | Iguais | Diferentes |
|---|---:|---:|---:|
| QDD: "Total da Ficha Orçamentária" por unidade × ação | 157 | 157 | 0 |
| QDD: "Total da Unidade Orçamentaria" | 17 | 17 | 0 |
| QDD: "Total do Orçamento" (linha 2607) | 1 | 1 | 0 |
| Órgão (01, 02): soma dos totais de unidade do QDD | 2 | 2 | 0 |
| Art. 3º: grupos de natureza (1.1.1 a 1.3.1) | 7 | 7 | 0 |
| **Art. 3º: despesas por unidade orçamentária** | 17 | 16 | **1** |
| Art. 3º: TOTAL GERAL da despesa (linha 172) | 1 | 1 | 0 |
| Anexo II (resumo geral da despesa): categoria e grupo | 10 | 10 | 0 |
| Anexo II: modalidade | 11 | 11 | 0 |
| **Anexo II: elemento** | 36 | 35 | **1** |
| Anexo II: elemento, CSV só com desdobramento 00.00 | 36 | 36 | 0 |
| Anexo II: Total Geral | 1 | 1 | 0 |
| Anexo II A: unidade × modalidade | 77 | 77 | 0 |
| **Anexo II A: unidade × elemento** | 262 | 261 | **1** |
| Anexo II A: "Total do Órgão" por unidade | 17 | 17 | 0 |
| Anexo IX: unidade × função, "Total do Órgão" e Total Geral | 35 + 17 + 1 | todas | 0 |
| Quadro por unidade e ação: unidade × ação (projeto + atividade + especial) | 157 | 157 | 0 |
| Consolidados (P, A) por ação, fonte, função, programa e subfunção | 157 / 32 / 22 / 32 / 38 | todas | 0 |
| Consolidado de receitas e despesas por fonte: Despesas (b) e Receitas (a) | 32 + 32 | todas | 0 |

**Total geral do CSV: 245.000.000,00.** É igual ao "Total do Orçamento" do QDD, ao TOTAL GERAL do art. 3º, ao Total
Geral do Anexo II, ao do Anexo IX e ao dos consolidados. O total de 245.000.000,00 inclui o FUNPREVE (02018,
30.736.200,00) e a reserva de contingência (02019, 2.044.968,34). O art. 4º remete o orçamento do FUNPREVE "ao
anexo", mas o texto do artigo não traz valor próprio. O valor do FUNPREVE que vale é o do QDD, e ele fecha com o
Anexo II A, com o Anexo IX e com o art. 3º (20.18).

## Diferenças encontradas (registradas, não corrigidas)

Nenhuma diferença vem da extração. Todas estão na própria lei, entre os quadros dela. Em todas, o CSV bate com o QDD
e com os totais de nível acima.

1. **Art. 3º, unidade 20.12 (Sec. de Agricultura, Recursos Hídricos e Meio Ambiente): 1,00.** O art. 3º imprime
   **8.836.202,66** (linhas 157–159; linha 213 do `.txt`). O QDD (linha 1925), o Anexo II A, o Anexo IX e o CSV
   (os três conferidos pelo script), e também o consolidado por unidade orçamentária (linha 5515, comparado a olho), dão **8.836.203,66**. A conta interna do próprio art. 3º não fecha: a
   soma das 17 unidades impressas é **244.999.999,00**, e o TOTAL GERAL impresso logo abaixo é 245.000.000,00
   (linha 172). O erro de digitação está no art. 3º. O CSV mantém o valor do QDD.
2. **Anexo II, elemento 3.1.90.04: 110.000,00.** O Anexo II imprime 3.1.90.04 "CONTRATAÇÃO POR TEMPO DETERMINADO"
   = **26.124.181,07** (linha 299). O CSV dá **26.234.181,07** porque soma a ficha 11275 (`3.1.90.04.01.00`,
   110.000,00). O Anexo II não tem linha própria para esse desdobramento. A modalidade 3.1.90 impressa,
   **114.017.110,69** (linha 293), inclui a ficha, e a soma dos elementos impressos sob ela dá 113.907.110,69. A falta
   de 110.000,00 está, portanto, dentro do próprio Anexo II. Contando só as fichas com desdobramento 00.00, o
   elemento bate exatamente: 36 de 36. O consolidado de pessoal (linhas 5700–5701) imprime as duas linhas
   separadas: 26.124.181,07 e 110.000,00.
3. **Anexo II A, unidade 2016 (Fundo Municipal de Saúde), elemento 3.1.90.04: 7.322.987,43.** O Anexo II A imprime
   uma única linha "3.1.90.04 SALARIO CONTRATO TEMPORARIO **110.000,00**" (linha 4173), que é só o desdobramento
   01.00. O desdobramento 00.00 da mesma unidade (7.322.987,43) não aparece em linha nenhuma do anexo. A modalidade
   3.1.90 da unidade, 23.794.375,89, e o total da unidade, 53.638.397,38, incluem esse valor e batem com o CSV.
   O CSV dá 7.432.987,43 para o elemento (7.322.987,43 + 110.000,00).

## Soma do CSV por órgão, unidade, fonte e função

Todas as somas abaixo batem com os totais impressos citados na tabela da conferência. A única exceção é a 02012 no
art. 3º (diferença 1).

| Órgão | Fichas | Valor |
|---|---:|---:|
| 01 Legislativo | 17 | 6.400.000,00 |
| 02 Executivo | 1.037 | 238.600.000,00 |

| Unidade | Descrição no QDD | Fichas | Valor | No TCE-PB? |
|---|---|---:|---:|---|
| 01001 | CAMARA MUNICIPAL | 17 | 6.400.000,00 | sim |
| 02002 | GABINETE DO PREFEITO | 34 | 1.691.317,77 | sim |
| 02003 | PROCURADORIA JURIDICA | 15 | 992.666,48 | sim |
| 02004 | SECRETARIA DE ADMINISTRACAO | 18 | 2.251.149,71 | sim |
| 02005 | SECRETARIA DE FINANCAS | 17 | 4.011.239,06 | sim |
| 02006 | SECRETARIA DE PLANEJAMENTO E COORDENACAO | 12 | 416.240,00 | sim |
| 02007 | SECRETARIA DE EDUCACAO E CULTURA | 241 | 102.325.274,26 | sim |
| 02008 | SECRETARIA DE ESPORTE E LASER | 22 | 4.109.211,61 | sim |
| 02009 | SECRETARIA DE ASSISTÊNCIA E SERVIÇO SOCIAL | 40 | 774.803,06 | sim |
| 02011 | SEC DE OBRAS, URBANISMO E TRANSPORTE | 78 | 15.434.286,94 | sim |
| 02012 | SEC DE AGRIC, REC HIDRICOS E MEIO AMBIENTE | 101 | 8.836.203,66 | sim |
| 02013 | SEC DE COMUNICACAO, EVENTOS E TURISMO | 17 | 6.198.522,00 | sim |
| 02015 | PROCON MUNICIPAL | 12 | 664.950,00 | sim |
| 02016 | FUNDO MUNICIPAL DE SAÚDE | 270 | 53.638.397,38 | sim |
| 02017 | FUNDO MUNIC DE ASSIST E SERVICO SOCIAL | 139 | 4.474.569,73 | sim |
| 02018 | FUNDO DE PREV. SOCIAL DOS SERVIDORES DE ESPERANCA | 20 | 30.736.200,00 | sim |
| 02019 | RESERVA DE CONTINGENCIA | 1 | 2.044.968,34 | **não** |

**Unidades contra as 17 declaradas ao TCE-PB** (`../tce-pb/esperanca-078/unidades-orcamentarias-2026-DERIVADO.csv`):
16 coincidem.
- **Só no QDD: 02019 RESERVA DE CONTINGENCIA** (2.044.968,34). É uma unidade só de dotação de reserva, e não
  empenha. Por isso não aparece numa lista de unidades derivada de empenhos.
- **Só no TCE-PB: 01000 CONSORCIO IRMA LUCIANA** (UG 701078). É outra entidade, com orçamento próprio, e não consta
  da LOA municipal. A participação do município aparece na LOA só como rateio, no elemento 3.3.71.70, com
  29.837,50.

| Fonte | Fichas | Valor |  | Fonte | Fichas | Valor |
|---|---:|---:|---|---|---:|---:|
| 500 | 576 | 73.957.987,60 | | 605 | 24 | 1.403.050,00 |
| 540 | 37 | 50.275.516,50 | | 621 | 6 | 656.260,00 |
| 541 | 27 | 11.267.300,00 | | 631 | 9 | 740.300,00 |
| 542 | 39 | 22.691.900,00 | | 632 | 4 | 1.628.000,00 |
| 543 | 6 | 700.000,00 | | 660 | 81 | 2.081.530,00 |
| 550 | 9 | 2.571.800,00 | | 669 | 1 | 50.050,00 |
| 551 | 4 | 11.000,00 | | 700 | 7 | 1.379.465,90 |
| 552 | 1 | 1.695.100,00 | | 701 | 14 | 1.480.600,00 |
| 553 | 6 | 335.500,00 | | 706 | 1 | 550.000,00 |
| 569 | 8 | 352.000,00 | | 710 | 6 | 550.000,00 |
| 570 | 10 | 1.668.700,00 | | 719 | 4 | 70.400,00 |
| 571 | 12 | 1.758.900,00 | | 750 | 1 | 38.500,00 |
| 575 | 2 | 58.300,00 | | 751 | 4 | 1.320.000,00 |
| 600 | 111 | 30.514.440,00 | | 800 | 5 | 29.502.000,00 |
| 601 | 5 | 316.800,00 | | 802 | 15 | 1.234.200,00 |
| 604 | 4 | 3.085.500,00 | | 899 | 15 | 1.054.900,00 |

As 32 fontes batem com a coluna Despesas (b) do "Consolidado das receitas e despesas por fonte de recurso"
(linhas 3416–3530) e com o "Consolidado por fonte (P, A)" (linhas 4654–4742). Nos dois quadros, a receita de cada
fonte é igual à despesa e o saldo é 0,00.

| Função | Valor | | Função | Valor |
|---|---:|---|---|---:|
| 01 Legislativa | 6.400.000,00 | | 15 Urbanismo | 14.984.796,34 |
| 02 Judiciária | 733.590,00 | | 16 Habitação | 341.000,00 |
| 04 Administração | 5.475.756,76 | | 17 Saneamento | 297.000,00 |
| 06 Segurança Pública | 150.090,60 | | 18 Gestão Ambiental | 707.300,00 |
| 08 Assistência Social | 5.249.372,79 | | 20 Agricultura | 5.130.303,66 |
| 09 Previdência Social | 30.415.000,00 | | 23 Comércio e Serviços | 4.909.322,00 |
| 10 Saúde | 53.888.097,38 | | 24 Comunicações | 1.289.200,00 |
| 12 Educação | 100.739.624,26 | | 25 Energia | 1.956.000,00 |
| 13 Cultura | 1.612.050,00 | | 26 Transporte | 506.000,00 |
| 14 Direitos da Cidadania | 664.950,00 | | 27 Desporto e Lazer | 4.109.211,61 |
| | | | 28 Encargos Especiais | 3.066.366,26 |
| | | | 99 Reserva | 2.374.968,34 |

As 22 funções batem com o "Anexo - Consolidado por função (P, A)", conferido pelo script. Comparei a olho a lista
por função da última página do QDD (linhas 2616–2637), que o script não lê, e ela também bate.

## Cadastros usados pelo QDD: programas e órgãos

```
node scripts/fontes/extrair-cadastros-loa-esperanca-2026.mjs    # gera programas-2026-DERIVADO.csv e orgaos-2026-DERIVADO.csv
node scripts/fontes/conferir-cadastros-loa-esperanca-2026.mjs   # conferência independente
```

| Arquivo | Linhas | sha256 |
|---|---:|---|
| `programas-2026-DERIVADO.csv` (`programa;descricao`) | 32 | `4aa38358ab5b866acf097e9e29b8fcea81b731d1f3a9779671102080895f635c` |
| `orgaos-2026-DERIVADO.csv` (`orgao;descricao;codigo_na_lei`) | 2 | `841fe293f9eb9a911373bf9c1d43418df6c94603619dcc40a2bcd1b5862228f5` |

- **Programas.** O nome vem do "CONSOLIDADO POR PROGRAMA (P, A)" (linhas 5131–5165), com o código de 4 dígitos do
  QDD. São 32 programas, exatamente os 32 que o `qdd-2026-DERIVADO.csv` usa: nenhum programa do QDD fica sem nome e
  nenhum nome sobra. O nome fica como a lei imprime, e o sistema emissor corta em 50 caracteres. Alguns nomes
  saem cortados ou com erro de digitação, e nenhum foi completado ou corrigido, porque a lei não traz o nome
  inteiro em lugar nenhum:
  - 1003 "GARANTIR O ACESSO A EDUCAÇÃO (EDUCAÇÃO DE QUALIDAD"
  - 1006 "SERVIÇOS DE PROTEÇÃO SOCIAL E POSSIB DE GERAÇÃO DE"
  - 1035 "ATENDIMENTO, PROCESSAMENTO E FISCALIZAÇÃO DOS DIRE"
  - 1004 "EDUCAÇÃO PARA JOVENS E DULTOS"
  - 1015 "DESNVOLVIMENTO ARTÍSTICO E CULTURAL"
- **Órgãos.** O nome vem dos cabeçalhos `10.0000 - LEGISLATIVO` e `20.0000 - EXECUTIVO` do quadro por unidade e
  ação. O código segue a convenção do QDD derivado, `01` e `02`, e o código impresso vai em `codigo_na_lei`.
- **Conferência, sem nenhuma diferença:**
  - Os 32 nomes são iguais aos do "Demonstrativo dos macro objetivos e programas" (linhas 2700–2754).
  - Nesse demonstrativo, o valor de cada programa é igual à soma do `qdd-2026-DERIVADO.csv` (32 de 32). O
    consolidado por programa já tinha batido, 32 de 32, na conferência do QDD acima. São dois quadros da lei
    contra o CSV.
  - Em 29 programas, a linha `ff.sss.pppp NOME` dos quadros por função, subfunção e programa traz o nome inteiro
    numa linha só, e esse nome também é igual. Os outros 3 programas têm a descrição quebrada em duas linhas nesses
    quadros e não entram nessa comparação.
  - O rótulo que o QDD imprime antes das unidades `1xxx` é LEGISLATIVO, e antes das `2xxx` é EXECUTIVO.
  - A soma dos "Total da Unidade Orçamentária" sob `10.0000` dá 6.400.000,00, e sob `20.0000` dá 238.600.000,00.
    As duas são iguais à soma do QDD derivado por órgão.
  - Para mostrar que a conferência detecta erro, alterei o nome de um programa e o de um órgão, e as duas
    alterações foram apontadas.
