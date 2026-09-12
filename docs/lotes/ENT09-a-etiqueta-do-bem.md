# ENT09 — a etiqueta do bem, pela tela

> Pedido do operador nesta sessão (2026-09-12), na mesma instrução que vem valendo desde o
> ENT06 item 1: **construção contínua**, sem parar para revisão a cada gate.
>
> ⚠️ **ESTE LOTE SUBSTITUI UM ESCOPO QUE A MEDIÇÃO DERRUBOU.** O pedido original era **a baixa
> do bem**, e foi medido até a parede antes de qualquer código — duas vezes, por dois motivos
> diferentes. O registro dessa medição está abaixo, porque um lote trocado sem explicação vira
> lote esquecido.

## O que a medição derrubou, e por quê

**Candidato 1 — a baixa do bem (`baixarBem`).** Bloqueada por **decisão do ente**, não por
falta de tela:

| Tabela no banco de desenvolvimento | Linhas |
|---|---|
| `ContaPcasp` | 7.864 |
| `RoteiroOrcamentario` | 5 |
| `LancamentoContabil` | 61 |
| **`RoteiroPatrimonial`** | **0** |

A contabilidade orçamentária roda; a patrimonial nunca foi parametrizada. `roteiroDoTipo` é
fail-closed e diz por quê — *"o M10 não inventa conta: sem roteiro, o movimento NÃO é
registrado"*. E a fonte oficial publica **plano de contas**, não mapeamento tipo-de-movimento →
débito/crédito: qual conta cada movimento debita e credita é decisão contábil do município.
Semeá-la para o percurso passar seria inventar norma, com efeito pior que a tela faltando —
lançamentos apontando para contas que ninguém escolheu. Pendência
`ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO`.

**Candidato 2 — "somente os meus bens" (`5.19.10`).** Bloqueada por **falta de vínculo no
modelo**: quem autentica é `Usuario`; quem responde pelo bem é `Pessoa`; e
`bensSobResponsabilidade` recebe um `Pessoa.id`. Nada liga os dois. Fechar a cláusula exige FK
nova e, antes dela, a decisão de saber se um usuário do sistema **é** uma pessoa do cadastro —
nem sempre é. Pendência `USUARIO-SEM-PESSOA`.

⚠️ **Dois candidatos consecutivos medidos até a parede é sinal, não azar.** O acervo tem duas
frentes restantes — a financeira e a de identidade — e as duas dependem de decisões que não são
de quem escreve código. O que sobra sem decisão pendente é pequeno, e é isto.

## O que este lote entrega

**A etiqueta com código de barras**, pela tela. `5.19.2` está `IMPLEMENTADO_NAO_VALIDADO` desde
o ENT05: o serviço existe, é testado, e nenhum servidor municipal o alcança.

| Medição | Resultado |
|---|---|
| Ação nova no censo? | **não** — `GERAR_ETIQUETA_DE_BEM` existe e está mapeada em `patrimonio` |
| Depende de roteiro contábil? | **não** — `gestao-do-bem.ts` tem ZERO chamadas ao razão (contado, não presumido) |
| Repetidor de campos? | **não** — a entrada é `{ bemId, criadoPor }` |
| Precisa de dado ausente no banco? | **não** — há bens |

- **Uma quinta ação no detalhe do bem**, "Gerar etiqueta", **sem campos** — o molde prevê isso
  ("vazio ⇒ só o botão"), e a etiqueta não pergunta nada: o conteúdo é o próprio tombamento.
- ⚠️ **O caso da porta NÃO usa o `comum(criadoPor)`** dos outros quatro, que carrega data do
  fato e motivo. A etiqueta não tem nenhum dos dois, e reaproveitar o objeto comum a faria
  pedir campos que ela não usa.

## A asserção que este lote existe para fazer

**Idempotência, pela tela.** `gerarEtiquetaDeBem` devolve `reaproveitada: true` quando o bem já
tem código, sem reescrever — porque gerar um código novo faria o leitor deixar de reconhecer a
etiqueta já colada na prateleira. O percurso **pressiona duas vezes** e afirma que a etiqueta é
a mesma. Um teste de unidade prova a função; só o percurso prova que o botão não a viola.

E, após recarga, o detalhe tem de mostrar o selo **"Etiquetado"** — que é derivado de
`codigoDeBarras`, e portanto prova persistência pelo caminho que o operador enxerga.

## O que NÃO entra

- **A baixa e o termo** — bloqueados acima; ficam documentados e prontos para quando houver
  decisão.
- **Impressão / PDF da etiqueta.** O serviço grava o código; renderizar o rótulo físico é outra
  coisa, com layout e tamanho de papel. Este lote entrega o ATO, não o artefato.

## Regime de rigor

**Superfície.** O caso de uso está provado contra banco desde o ENT05, incluindo a
idempotência. O que este lote deve é teste de autorização no servidor e **um percurso de
navegador**, com a dupla pressão do botão como asserção central.
