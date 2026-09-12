# ENT12 — o eixo de valor do bem, pela tela

> Pedido do operador nesta sessão (2026-09-12): *"o eixo financeiro do patrimônio está
> inalcançável... escreva tudo para destravar e crie, quero ver telas, funções, lógicas e ação
> do sistema"*, e depois *"segue o fluxo"*. O ENT11 entregou a parametrização do roteiro; este
> lote entrega o que ela destravou. Escrito **antes** do lote começar, como a regra manda.

## A medição que define o escopo

O ENT11 fechou a primeira parede (`RoteiroPatrimonial` com zero linhas). A segunda apareceu no
reconhecimento deste lote, e é maior:

```
grep -rn "registrarEntradaAvulsa|adquirirBem|registrarReavaliacao|atualizarCompetencia|
          baixarBem|alienarBem|registrarImpairment" lib/ app/
-> dois acertos, AMBOS em linhas de comentário.
```

**Nenhuma porta e nenhuma tela tocam o eixo de valor.** Sete serviços com domínio provado,
teste contra banco e **ação no censo desde o ENT05** — e superfície zero. O valor do bem só
existe hoje por escrita de teste ou pelo seed da POC.

⚠️ **E ISSO ORDENA O LOTE.** A baixa sozinha seria **inalcançável por percurso**: `baixarBem`
tem teto duplo (não baixa mais que a classe, nem mais que o bem), e sem tela de entrada todo
bem vale zero — a baixa seria sempre recusada, com razão. É a mesma lição de "a classe vem
antes do bem", agora medida **antes** e não depois.

## O que entra

A cadeia mínima que se prova sozinha, toda no detalhe do bem:

| | |
|---|---|
| **Registrar entrada de valor** | `registrarEntradaAvulsa` — `AVALIACAO_INICIAL` ou `DOACAO_RECEBIDA` |
| **Baixar do acervo** | `baixarBem` — `BAIXA_ALIENACAO` ou `DOACAO_REALIZADA` |
| **O detalhe passa a mostrar o VALOR CONTÁBIL** | derivado dos movimentos, nunca uma coluna |
| **O histórico passa a trazer os movimentos de valor** | hoje ele traz só o eixo de gestão |

⚠️ **O VALOR NO DETALHE NÃO É ENFEITE.** O domínio recusa baixa acima do valor do bem. Oferecer
o formulário sem mostrar quanto ele vale é montar uma armadilha — o operador digita, o servidor
nega, e a tela nunca disse qual era o teto.

⚠️ **AS AÇÕES NÃO PEDEM A CLASSE.** O bem já tem uma, e a porta a deriva dele. Um seletor
permitiria escolher classe diferente da do bem, e o núcleo recusaria com uma mensagem sobre
levantamento por classe que não diz nada a quem está baixando um armário.

## Regime de rigor

**Superfície.** As sete ações já existem no censo (`acoes.ts:743-750`), o domínio está provado
(`m10-patrimonio.test.ts`, `m10-alienacao.test.ts`, `m10-competencia.test.ts`), e nada de novo
entra no razão. Logo: **zero migration, zero ação nova**, teste de caso de uso na porta, teste
de autorização no servidor, e **um percurso de navegador** pela família de tela.

⚠️ Rebaixar profundidade para superfície é decisão que precisa aparecer — e aqui não há
rebaixamento: o que este lote acrescenta é superfície sobre domínio já provado em profundidade.

## O que NÃO entra, e por quê

| Fora | Motivo |
|---|---|
| `alienarBem` | composto: `valorVenda`, `acumuladaBaixada`, `receitaArrecadadaId`, quatro guards e dois movimentos sob um `operacaoId`. É **profundidade**, e misturá-lo rebaixaria este lote |
| `atualizarCompetencia` (depreciação) | depende de `ParametroAtualizacaoClasse`, que **não tem tela nem caso de uso** — o único `definirParametro*` do repositório é do estoque. Pendência `PARAMETRO-DE-CLASSE-SEM-CASO-DE-USO` |
| `adquirirBem` | exige `liquidacaoId`: o bem nasce de despesa liquidada, e o caminho é a cadeia do M05, não a tela do acervo |
| FK de `MotivoDeBaixa` no movimento | o cadastro é **órfão** (só cadastrar/listar/ver; nenhum leitor). Amarrá-lo exige coluna nova — aditiva, mas migration. Pendência `BAIXA-SEM-MOTIVO-CADASTRADO`, lote curto próprio |
| Estorno de movimento de valor | `estornarMovimentoPatrimonial` existe e é provado; a tela dele é outro ato |

## O que o percurso tem de provar

1. O detalhe mostra **valor contábil zero** antes de qualquer entrada.
2. A entrada é aceita, e **após recarga** o valor aparece.
3. A baixa **acima do valor do bem** é RECUSADA, nomeando o teto — negação que afirma o motivo.
4. A baixa dentro do valor é aceita, e após recarga o valor **caiu**.
5. Os movimentos de valor aparecem no histórico, **ao lado** dos de gestão, sem um sobrescrever
   o outro.
6. Evento sem roteiro parametrizado é recusado com a mensagem do M10 — a amarração com o ENT11.

## Risco conhecido

O percurso depende de roteiro parametrizado para o tipo que ele usar. Ele **não** vai semear
roteiro: semear para um percurso passar seria inventar norma, que é exatamente o que o ENT09
recusou fazer. Ele parametriza **pela tela do ENT11**, e com isso o lote prova a cadeia inteira
— parametrizar, entrar, ver, baixar.
