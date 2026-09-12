# O edital — a fonte e a medida

Aqui estão o documento oficial do certame e o catálogo que mede quanto dele está atendido.
Vieram de `gestao-publica-execucao`, um repositório separado, absorvidos com histórico.

| Arquivo | O que é |
|---|---|
| `Termo_de_referencia.pdf` | o documento oficial, 189 páginas. A fonte quando o texto de uma cláusula importar |
| `catalogo-execucao.json` | as 2.037 cláusulas com localizador, situação e evidência |
| `condicoes-operacionais-e-contexto.json` | as condições do termo que não são cláusula |
| `resultado-auditoria.json` | auditoria estrutural do catálogo contra o PDF |
| `gerar-catalogo.py`, `gerar-condicoes.py` | como o catálogo foi gerado a partir do PDF |
| `.cache-tr-layout.txt` | o texto intermediário do PDF, versionado de propósito |

## Quem escreve no catálogo

Só `scripts/marcar-catalogo.ts`, com um mapa explícito de cláusula para evidência, e ele
recusa marcação sem evidência. Rodar sem `--aplicar` relata o que faria.

O caminho é resolvido a partir do próprio script. `CATALOGO` no ambiente aponta para outro
arquivo quando for preciso — é o que permite conferir um catálogo de outra máquina sem
tocar neste.

## Por que o texto intermediário é versionado

`.cache-tr-layout.txt` é derivado do PDF por `pdftotext -layout`, e **a saída depende da
versão do poppler instalado**. Uma versão diferente pode cortar as cláusulas em fronteiras
diferentes — e os identificadores de cláusula são a chave de toda evidência já registrada.
Versionar o intermediário é o que permite provar que uma regeração futura produziu o mesmo
recorte. Ele não é lixo de build; é o testemunho do corte.

## O limite da auditoria

`resultado-auditoria.json` diz `APROVADO_ESTRUTURALMENTE`, e a própria palavra é o limite:
ela confere que o catálogo corresponde ao PDF — contagem, identificadores, ausência de
duplicados. **Não valida implementação, cobertura funcional, norma nem integração externa.**

## O que a situação de uma cláusula significa

As seis situações estão explicadas no cabeçalho de `scripts/marcar-catalogo.ts`, e a regra
que as governa está no `CLAUDE.md`: marcação só com comportamento, teste e evidência, e na
dúvida o nível mais baixo. `VALIDADO_LOCALMENTE` exige percurso de navegador — sem tela, um
servidor municipal não alcança.
