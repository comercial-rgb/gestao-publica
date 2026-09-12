# ENT10 — a autorização de leitura por unidade

> Pedido do operador nesta sessão (2026-09-12): após o checkpoint de revisão, "continue as
> tarefas". Escrito **antes** do lote começar, como a regra manda.
>
> ⚠️ **ESTA É A SEGUNDA VERSÃO DO PEDIDO, E A PRIMEIRA ESTAVA ERRADA EM DOIS PONTOS.** Ela
> apresentava o achado como descoberta nova e escolhia uma costura de teste que não existe. A
> medição desmentiu as duas coisas antes de qualquer código, e a correção pertence ao documento
> — não a uma nota de rodapé depois.

## O que este lote NÃO é

⚠️ **O achado não é novo, e o crédito não é meu.** `test/ui/contexto-ug.test.ts` nasceu do
**mesmo furo**, e o cabeçalho dele o descreve palavra por palavra: *"uma tela de LEITURA não
chama `autorizar` — então o usuário da Saúde escolhia 'Educação' no seletor e LIA os dados da
unidade que não é dele, sem que nada reclamasse"*. Aquele lote **corrigiu o seletor** e provou a
regra em quatro testes, inclusive o fail-closed de quem não tem crachá.

**O que ficou aberto é a outra metade: a URL.** Este lote fecha uma correção parcial já
declarada — não inaugura um assunto.

## O defeito, no ponto exato

Não está numa camada esquecida. Está na **assinatura**:

| Arquivo | Evidência |
|---|---|
| `modules/m05-despesa/consultas.ts:589-601` | `daFicha(p)` compõe `unidadeOrc: { codigo }` **só quando informado**; sem ele o `where` é apenas por exercício. **A omissão produz o consolidado no próprio SQL** |
| `lib/portas/empenho.ts:64-86` | `unidadeCodigo?: string \| undefined` — **opcional**, e ninguém pergunta se quem pediu podia |
| `lib/recorte.ts:36-46` | exercício ilegível → **2026 em silêncio**; `ug` ausente → consolidado; o arquivo declara-se "só parse de string" |
| `lib/portas/molde.ts:89-91` | `exigirLeitura()` é `return exigirSessao()` — nome de autorização, corpo de autenticação; **42 telas** a chamam |
| 10 rotas de exportação | **todas** com `exigirSessao` e nada mais: NE, guia e oito PDFs, por `GET` direto, sem menu |

⚠️ **E o contraste prova que não é descuido de estilo:** a **escrita** resolve a unidade pelo
**alvo do fato** (`escopo.ts:238 resolverUgs`) e autoriza por UG. A leitura não tem equivalente.

## A costura do teste — e a nota que a destravou

A primeira versão deste pedido escolheu `lib/pdf/operacionais.ts` por "não importar `cliente()`".
**Errado:** ele importa as portas de leitura, e `lib/portas/empenho.ts:1` importa `cliente`. A
dependência é transitiva — conclusão tirada da ausência na primeira linha de imports.

⚠️ **Mas a medição trouxe a resposta certa, e ela corrige uma afirmação do próprio repositório.**
`lib/portas/cliente.ts` **não importa `next/headers`**: é um singleton preguiçoso sobre
`DATABASE_URL`, com `PortaSemBancoError` nomeado. A nota de `contexto-ug.test.ts` — *"`lib/portas/cliente`
depende de `next/headers`, inalcançável fora de um request"* — **está factualmente errada**. Quem
depende de request é `sessao.ts`, que lê headers; as portas de **leitura** não.

**Consequência:** a caracterização chama `listarEmpenhosDaExecucao` **de verdade**, em vez de
reproduzir a consulta. E a limitação que o teste vizinho carrega — *"se a porta divergir desta
consulta, o teste continua verde"* — vira pendência a corrigir:
**`CONTEXTO-UG-REPRODUZ-CONSULTA`**.

⚠️ **E não há cobertura de exportação.** `test/pdf/pdf.test.ts` exercita `documento.ts` e
`gerar.ts` (hash, HTML, Chromium) com um `DocumentoPdf` literal. **Nenhum montador real** é
testado; as dez rotas seguem sem teste.

## O que deve entrar

- **Um recorte AUTORIZADO**, que receba a identidade e o pedido da URL e devolva o recorte
  efetivo — ou **recuse nomeando**:
  - unidade fora do conjunto do usuário → recusa dizendo que está **fora do escopo dele** (não
    "não encontrado", que mentiria sobre a existência);
  - `ug` omitida **e** `podeConsolidado` falso → cai no escopo dele, ou recusa se não tiver
    nenhuma. **Nunca** consolidado por omissão;
  - `ug` omitida **e** `podeConsolidado` verdadeiro → consolidado, como hoje;
  - **exercício ilegível → recusa**, não `2026` silencioso.
- **`RecorteDaExecucao` chegando já resolvido** às portas de leitura — `unidadeCodigo` deixa de
  ser opcional no caminho autorizado. É a mudança de assinatura que torna o defeito
  inexprimível, em vez de vigiado.
- **As 10 rotas de exportação primeiro**, depois as 16 páginas. As rotas entregam o arquivo
  inteiro sem passar por menu.
- **`exigirLeitura` deixa de mentir**: ou exige escopo, ou perde o nome.

## A boa notícia: o resolvedor existe e está correto

`listarUgsDoUsuario` (`lib/portas/contexto.ts`) já deriva as unidades do usuário, trata
`unidadeOrcId` nulo como **global** e devolve vazio para usuário inativo. `carregarContextoDoUsuario`
já entrega `{ ugs, podeConsolidado }` — e hoje isso alimenta **apenas** o seletor do cabeçalho
(`layout.tsx:28,40`). O lote **liga o que existe**; não escreve guarda nova.

⚠️ E o lugar arquitetural já estava escrito: `test/ui/fronteira-ui.test.ts` diz, no cabeçalho,
que a porta é onde *"nas próximas fatias, entram a sessão (6.3), a autorização (6.4) e a
segregação por UG (6.5)"*. A vaga está aberta desde então.

## Regime de rigor

**Profundidade** — é guard, e o CLAUDE.md põe guards nesse regime por nome.

- **Caracterização antes de ampliar**: medir que hoje a unidade alheia É servida, chamando a
  porta real.
- **Fixture N=2**: duas unidades e um usuário com permissão em **uma**. Com uma unidade a regra
  passa por vacuidade. O padrão existe em `m16-permissoes.test.ts:290` e em `contexto-ug.test.ts`
  (prefixo `ctx.`, para não colidir com as identidades que o `limparBanco` semeia como ADMIN).
- **Tripwire provado por mutação nas duas direções**: afrouxe a recusa, confirme vermelho,
  reverta.
- **Negação que afirma o motivo**: "unidade fora do seu escopo" e "exercício inválido" são
  respostas diferentes, e cada uma diz o que fazer em seguida.

## O que NÃO entra

- **Reescrever `listarUgsDoUsuario`** — está correto e documentado; este lote o consome.
- **Mudar o modelo de permissão** — `unidadeOrcId` nulo = global já é a representação certa.
- ⚠️ **Afrouxar qualquer coisa para uma tela passar.** Se uma tela quebrar com o recorte
  autorizado, o defeito está na tela — nunca no guard.

## Nota sobre o inventário

`test/incremento-25.test.ts` item 23 declara **COBERTO**: *"as 15 rotas HTTP são GET de leitura,
e nenhuma chama serviço do censo de mutação"*. Está correto **e é sobre outra pergunta**: prova
que nenhum `GET` escreve; este lote é sobre `GET` que **lê o que não devia**.
