# ENT10 — a autorização de leitura por unidade

> Pedido do operador nesta sessão (2026-09-12): após o checkpoint de revisão, "continue as
> tarefas". Escrito **antes** do lote começar, como a regra manda.
>
> ⚠️ **ESTE LOTE NÃO É FUNCIONALIDADE NOVA — É CORREÇÃO.** Ele sai do achado B do checkpoint
> (§30.3), que foi medido caminho a caminho e classificado como **AINDA PRESENTE**.

## O que foi medido, e por que é grave

| Arquivo | Evidência |
|---|---|
| `lib/portas/molde.ts:89-91` | **`exigirLeitura()` é `return exigirSessao()`** — nome de autorização, corpo de autenticação. **42 telas** a chamam |
| `lib/portas/sessao.ts:45-52` | `exigirSessao` = sessão ou redirect. Sem unidade, sem escopo |
| `lib/recorte.ts:36-46` | exercício ilegível → **2026 em silêncio**; `ug` ausente → **consolidado (o ente inteiro)**; o arquivo declara-se "só parse de string" |
| `lib/portas/empenho.ts:84,110,133` | `unidadeCodigo` só é espalhado em parâmetro de consulta; o único import de autorização é `comEscritaAutenticada` (**escrita**) |
| 10 rotas de exportação | **todas** com `exigirSessao` e nada mais: NE, guia de arrecadação e oito PDFs |
| grep | `unidadesDoUsuario` / `escopoDeLeitura` / `ugsDoUsuario` → **nenhuma ocorrência** |

⚠️ **E o contraste é o que prova que não é descuido de estilo:** a **escrita** resolve a unidade
a partir do **alvo do fato** (`escopo.ts:238 resolverUgs` — por ficha, empenho, liquidação,
setor, reserva) e só então autoriza por UG. A leitura não tem equivalente. A assimetria é
estrutural.

## A boa notícia: o resolvedor já existe e está correto

`listarUgsDoUsuario` (`lib/portas/contexto.ts`) já deriva as unidades do usuário a partir das
permissões dos perfis dele, trata `unidadeOrcId` nulo como **global**, e devolve vazio para
usuário inativo ou inexistente. `carregarContextoDoUsuario` já entrega `{ ugs, podeConsolidado }`.

⚠️ **Mas hoje isso alimenta APENAS o seletor do cabeçalho** (`app/(areas)/layout.tsx:28,40`). O
repositório **já sabe** o que cada usuário pode ver, e usa esse conhecimento só para desenhar o
menu. `podeConsolidado` — a resposta exata para "pode ver o ente inteiro?" — é calculada,
entregue à casca e **nunca consultada por consulta alguma**.

**Portanto este lote LIGA o que existe; não escreve guarda nova.**

## O que deve entrar

- **Um recorte AUTORIZADO**, que receba a identidade e o que a URL pediu e devolva o recorte
  efetivo — ou **recuse nomeando**. Regras:
  - unidade pedida fora do conjunto do usuário → **recusa**, dizendo que a unidade não está no
    escopo dele (não "não encontrado", que mentiria sobre a existência);
  - `ug` omitida **e** `podeConsolidado` falso → **não** vira consolidado: cai no escopo dele,
    ou recusa se ele não tiver nenhuma;
  - `ug` omitida **e** `podeConsolidado` verdadeiro → consolidado, como hoje;
  - **exercício ilegível → recusa**, não `2026` silencioso. Hoje a tela responde por um ano que
    ninguém pediu.
- **As 16 páginas e as 10 rotas de exportação** passando por ele. As rotas primeiro: elas
  entregam o arquivo inteiro por `GET` direto, sem menu.
- **`exigirLeitura` deixa de mentir**: ou passa a exigir escopo, ou perde o nome. Uma função
  chamada por 42 telas não pode prometer autorização e entregar autenticação.

## Regime de rigor

**Profundidade** — é guard, e o CLAUDE.md põe guards nesse regime por nome.

- **Caracterização antes de ampliar**: teste que mede o comportamento atual (unidade alheia
  pedida pela URL é servida hoje) **antes** de mudá-lo.
- **Fixture N=2**: duas unidades e um usuário com permissão em **uma** delas. Com uma unidade a
  regra passa por vacuidade. ⚠️ Isso vai no **banco isolado da suíte**, onde `uo-01`/`uo-02` já
  são padrão de fixture — não no banco de desenvolvimento, que tem uma única unidade.
- **Tripwire provado por mutação, nas duas direções**: afrouxe a recusa, confirme vermelho,
  reverta.
- **Negação que afirma o motivo**: "unidade fora do seu escopo" e "exercício inválido" são
  respostas diferentes, e cada uma diz o que fazer em seguida.

## O que NÃO entra

- **Reescrever `listarUgsDoUsuario`** — está correto e documentado. Este lote o consome.
- **Mudar o modelo de permissão.** `PermissaoDePerfil` com `unidadeOrcId` nulo = global já é a
  representação certa.
- ⚠️ **Afrouxar qualquer coisa para uma tela passar.** Se uma tela quebrar com o recorte
  autorizado, o defeito está na tela — nunca no guard.

## Nota sobre o inventário

`test/incremento-25.test.ts` item 23 declara **COBERTO**: *"as 15 rotas HTTP são GET de leitura,
e nenhuma chama serviço do censo de mutação"*. Está correto **e é sobre outra pergunta**: prova
que nenhum `GET` escreve; este lote é sobre `GET` que **lê o que não devia**. Um inventário
inteiro correto pode não cobrir a pergunta que interessa — e "COBERTO" ali não autoriza fechar
o achado B.
