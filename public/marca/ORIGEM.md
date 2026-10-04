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
| `engine-simbolo-branco.svg` | `02-icons/mono-white/icon-mono-white.svg` | `48a5f20b8be74f4dce8fd1ef8157dff4` |
| `engine-pwa-icon-192.png`, `-512` | `03-web/pwa-icon-192.png`, `-512` | — |
| `engine-pwa-maskable-192.png`, `-512` | `03-web/pwa-maskable-192.png`, `-512` | — |
| `app/icon.svg` (ícone da aba) | `02-icons/color/icon-color.svg` (o mesmo de `engine-simbolo.svg`) | `7e1f374d19f4e62dd263c91c3105f53e` |
| `app/favicon.ico` | `03-web/favicon.ico` | `62f4015b24672972ac428eb766164b80` |
| `app/apple-icon.png` | `03-web/apple-touch-icon-180.png` | `833ab49bb89e0e0820c265ad8344d45b` |
| `app/opengraph-image.png`, `app/twitter-image.png` | `03-web/og-image-1200x630.png` | `4ec9a0417da7e4e2a74d31b007d13c78` |

Os do `app/` seguem a convenção de arquivos do Next (ícone da aba, ícone de toque, imagem de
compartilhamento); o `app/manifest.ts` aponta os ícones de aplicativo daqui. O símbolo branco é a
marca d'água da entrada (`components/ui/MotivoDaMarca.tsx`), e foi conferido como os outros SVG.

⚠️ **Os nomes foram trocados de propósito.** No kit, "dark" e "white" nomeiam a cor do TEXTO, não
o fundo — e é uma troca fácil de fazer: `logo-horizontal-dark.svg` é o de texto grafite, que vai
em fundo **claro**. Conferido nas cores de cada arquivo: o de fundo claro tem 17 ocorrências de
`#1a1a1a` e nenhuma de `#fefefe`; o de fundo escuro tem 14 de `#fefefe` e só 3 de `#1a1a1a`. Os
nomes daqui dizem **onde se aplicam**, que é a pergunta de quem escreve a tela.

## A conferência de segurança dos SVG

Os SVG foram inspecionados antes de entrar, porque **SVG servido é documento executável**:
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

## O manual aplicado às telas (2026-10-03)

As cores, raios, pesos e componentes do manual (kit v2, `02-design-tokens` e `06-prompts`) estão em
`app/globals.css`, com o motivo de cada desvio escrito ao lado do token:

- **Botão de ação**: pílula, fundo no laranja oficial, texto grafite (6,0:1), Exo 2, sombra laranja
  ao passar o mouse. **Secundário**: contorno de 2px laranja.
- **Link e texto em laranja**: continuam no laranja forte `#C24F00`. O oficial como texto sobre
  branco dá 2,9:1 e reprova.
- **Campo**: raio de 10px; no foco, borda laranja e anel a 25%, mais o contorno de foco global.
- **Cartão**: raio de 16px. **Números de painel**: Exo 2 900, em laranja forte.
- **Títulos**: Exo 2, 800 nos dois primeiros níveis e 700 no terceiro.
- **Neutros**: fundo #FEFEFE, borda #E2E0E0, texto apagado #5A5A5E. O "Cinza Claro" #ECEBEB fica
  como fundo da entrada, não das faixas de tabela, porque o link sobre ele dá 4,0:1.
- **Entrada**: marca d'água da engrenagem, traços de circuito a 10% e brilho laranja no canto.

Ficaram de fora, de propósito: o **tema escuro** (o sistema não tem um; é trabalho próprio) e as
**capas de sistema** como fundo da entrada (são peça comercial, com texto de marketing).
