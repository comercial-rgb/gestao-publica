# Os ativos da marca Engine Sistemas — de onde vieram e como se usam

> Copiados em 2026-09-16 (V9 N1). **Nenhum deles foi redesenhado, recolorido ou recortado.**

## Origem

Kit oficial em `~/Desktop/MS Frotas/engine-brand-kit/` (o kit gerado a partir do arquivo `.ai`).
O kit v2 (`engine-brand-kit-v2/`) diz, no próprio README, que os vetores em alta, os favicons e
os ícones de aplicativo **estão no kit anterior** — os dele foram extraídos do PDF do brandbook,
a ~480 px. Por isso a origem aqui é o kit v1; do v2 vêm os *tokens* de cor, adiante.

| Arquivo aqui | Origem exata | md5 |
|---|---|---|
| `engine-horizontal-fundo-claro.svg` | `03-web/logo-horizontal-dark.svg` | `8639a822e479792a026d3e49740b6cd9` |
| `engine-horizontal-fundo-escuro.svg` | `03-web/logo-horizontal-white.svg` | `9fee132cc8bbdaaac5bb802e7332944a` |
| `engine-horizontal-fundo-claro.png` | `03-web/logo-horizontal-dark.png` | — |
| `engine-horizontal-fundo-escuro.png` | `03-web/logo-horizontal-white.png` | — |
| `engine-simbolo.svg` | `02-icons/color/icon-color.svg` | `7e1f374d19f4e62dd263c91c3105f53e` |
| `engine-favicon-32.png` | `03-web/favicon-32x32.png` | — |
| `engine-touch-180.png` | `03-web/apple-touch-icon-180.png` | — |

⚠️ **Os nomes foram trocados de propósito.** No kit, "dark" e "white" nomeiam a cor do TEXTO, não
o fundo — e é uma troca fácil de fazer: `logo-horizontal-dark.svg` é o de texto grafite, que vai
em fundo **claro**. Conferido nas cores de cada arquivo: o de fundo claro tem 17 ocorrências de
`#1a1a1a` e nenhuma de `#fefefe`; o de fundo escuro tem 14 de `#fefefe` e só 3 de `#1a1a1a`. Os
nomes daqui dizem **onde se aplicam**, que é a pergunta de quem escreve a tela.

## A conferência de segurança dos SVG

Os três SVG foram inspecionados antes de entrar, porque **SVG servido é documento executável**:
procurados `<script`, `onload=`, `href="http`, `xlink:href="http`, `<foreignObject` e `<image`.
**Nenhuma ocorrência em nenhum deles** — só `path` e `clipPath`. Não houve necessidade de cair
para o PNG oficial; os PNG ficam aqui mesmo assim, como alternativa já conferida.

## Como se aplicam

- **Fundo claro** → `engine-horizontal-fundo-claro.svg`. **Fundo escuro** →
  `engine-horizontal-fundo-escuro.svg`. Escolher pelo fundo, nunca pelo tema "parecer melhor".
- **Proporção preservada**: o lockup é 1920×597 (≈3,22:1). Definir só a altura e deixar a largura
  em `auto`.
- **Área de proteção**: manter ao menos a altura do símbolo de folga em volta. No rodapé isso é a
  distância mínima até o texto vizinho.
- **Transparência**: os arquivos têm fundo transparente. Não pôr caixa branca atrás.

## O que NÃO se faz com eles

- Não são a identidade do **ente**. O brasão, o nome e as cores do município vêm do cadastro
  (`lib/portas/identidade.ts`) e aparecem no cabeçalho. A marca Engine é do **fornecedor**, e
  aparece na entrada do produto e no rodapé, com "Desenvolvido por Engine Sistemas".
- Não se redesenha, não se recolore, não se estica, não se aplica sombra ou contorno.
- Nada mais da pasta de origem foi copiado: capas comerciais, carrossel de Instagram, brandbook e
  material de marketing ficam fora do repositório.
