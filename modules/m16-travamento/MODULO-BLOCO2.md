# M16 bloco 2 — usuários, perfis e permissões

**TR 4.55** (cadastro de usuários) · **TR 4.56** (permissões) · **6.4/6.5** (segregação de
funções e por unidade gestora).

## ⚠️ CORREÇÃO: a coluna `competencia` **é lida**. A remoção foi CANCELADA.

Em `a4f2bd6` eu afirmei que ela era *"escrita e nunca lida"*, e este bloco vinha com a remoção
como **decisão fechada**. **A afirmação era falsa** — e o grep de verificação que o próprio
passo 0 exigia provou o contrário, **antes** de qualquer migração destrutiva:

- [`packages/ledger/estorno.ts:63`](../../packages/ledger/estorno.ts#L63) —
  `competencia: params.competenciaEstorno ?? original.competencia`. **O estorno HERDA a
  competência do original.**
- ~20 pontos de estorno (M01, M04, M05, M07, M08, M10) fazem `select: { competencia: true }` do
  original e a carregam para o estorno.
- `m01/adapter-prisma` a devolve no objeto de domínio do `buscar()`.

E ela **diverge** da `dataTransacao`. Rodado contra o banco de verdade:

```
2026NL000099   dataTransacao=2026-07-05   competencia=2026-07-01   <<< DIVERGEM
```

### E aí mora um problema MAIOR do que o que eu tinha nomeado

Hoje **nenhum relatório corta por `competencia`** — MSC, DVP, Balanço e o próprio travamento
cortam por `dataTransacao`. Existe, portanto, no razão, uma **segunda competência DORMENTE** que
afirma que o estorno de janeiro *pertence a dezembro*.

⚠️ **No dia em que alguém escrever um relatório que corte por ela, fatos de janeiro vão retroagir
para dezembro — depois de dezembro fechado — e o travamento não vai ver nada**, porque ele olha
a outra data.

Não é para remover no embalo, e **não é para deixar quieto**. É a decisão do **5.87/5.88** (qual
data é a competência contábil), e ela precede qualquer mexida. **A coluna não foi tocada.**

## O censo — 78 serviços, 77 ações

O `encerrarExercicio` e o `encerrarExercicioComRestos` compartilham a mesma ação: são dois
caminhos para o **mesmo ato administrativo**, e dar-lhes crachás diferentes deixaria o ente
conceder um e negar o outro sem saber que concedeu o mesmo poder duas vezes.

### ⚠️ "Serviço sem ação não compila" NÃO é alcançável só com Record

O `ACAO_DO_SERVICO` é exaustivo sobre a união `NomeDeServico` — que é **escrita à mão**. Ele
garante que um nome **declarado** sem mapeamento não compila. **Ele não garante que um serviço
NOVO apareça na união**: quem escrever `pagarPrecatorio()` amanhã simplesmente não a declara, e
o compilador **não sabe que o serviço existe**.

A rede que pega isso é o **grep-teste** (`m16-censo.test.ts`), com a mesma anatomia do do funil.
E ele tem **duas pontas**:

| | falha quando | por quê |
|---|---|---|
| **t5** | serviço fora do censo | é uma **porta sem fechadura**: ninguém pode negá-lo porque ninguém sabe que ele existe |
| **t5b** | ação sem serviço | o rol **apodrece**, e o ente concede **poderes fantasmas** que o TCE lê acreditando |

**Ele já provou o valor:** pegou dois serviços que o meu censo manual tinha perdido.

O que fica **fora** é uma lista **com o motivo de cada exclusão** (leitura, guard, composável
interno, lock, seed) — nada sai do censo por descuido.

## `autorizar` — negar é o padrão

Ele **não devolve `boolean`**: passa ou estoura. Um `boolean` convida ao `if (podeEmpenhar)`, e
o dia em que alguém esquecer o `if`, o sistema **autoriza em silêncio**.

**Quatro portas, quatro mensagens** — porque *"acesso negado"* não responde ao TCE quando ele
pergunta **por quê**:

| porta | mensagem |
|---|---|
| não existe | `USUÁRIO NÃO CADASTRADO` — a identidade é falsa |
| inativo | `USUÁRIO INATIVO` — existia, e foi revogada (*e os fatos dele continuam válidos*: o razão é append-only e não se reescreve o passado) |
| sem perfil | `ACESSO NEGADO — SEM PERFIL` — existe, e não tem crachá nenhum |
| sem a permissão | `ACESSO NEGADO: … não tem permissão para EMPENHAR` — tem crachá, não este poder |

## Identidade ≠ autorização — e é por isso que são DOIS guards

**O funil confere IDENTIDADE. O serviço confere PODER.**

O funil **não pode** autorizar: um `LancamentoContabil` chega lá **idêntico** venha ele de um
empenho, de um pagamento ou de uma provisão. Ele **não sabe** qual ação está sendo executada — e
fingir que sabe (adivinhando pelo `origemTipo`, que é string livre) construiria uma autorização
que **erra em silêncio**.

O que **todo** fato tem em comum é **um autor** — e é isso que o funil cobra. Isso **cura a
pendência de `a4f2bd6`**: o `criadoPor` era string livre, um nome que ninguém podia cobrar.

⚠️ **Consequência, e ela é testada:** o usuário **sem perfil nenhum** *passa no funil* (ele existe
e está ativo) e é barrado **no serviço**. Os dois guards são **complementares**, não redundantes.

## `usuarioAlvo` validado — a outra cura de `a4f2bd6`

Era string livre comparada com string livre. Um typo — `"alicce@cg.pb.gov.br"` — **gravava o
evento**, a tela dizia *"maio travado para a alice"*, e **a alice continuava lançando**. O
sistema mentia, e ninguém percebia. Agora o alvo é conferido contra o cadastro, e o `travar`
**cai**, nomeando.

## A segregação 6.4/6.5 pesa dos DOIS lados

- **EXECUCAO** empenha, liquida, paga — e **não trava nem destrava**.
- **CONTROLE** trava, destrava, apura, encerra — e **não empenha**.

⚠️ **Quem empenha não fecha o mês em que empenhou.** Se pudesse, cometeria o erro, trancaria a
competência, e o controle interno encontraria o período fechado **com o erro dentro**.

E o contrapeso **só é contrapeso se pesar dos dois lados**: um "controle" que também executa é
apenas um usuário com mais poder, e a segregação vira decoração. Por isso o `FISCAL` também é
**negado** ao tentar `EMPENHAR` — e há teste.

### O escopo de UG (6.5)

`unidadeOrcId` **nulo = todas as UGs**, e é **concessão explícita**, não default preguiçoso. A
alternativa (*nulo = nenhuma*) tornaria a permissão global **inexprimível**, e o ente teria de
listar as 40 unidades uma a uma — e **esquecer a 41ª quando ela nascesse**.

⚠️ **E a permissão de UMA UG não autoriza o ato SEM UG.** *"Poder pagar na Saúde"* **não é**
*"poder fechar a competência do ente inteiro"*: travar não pertence a unidade nenhuma. Dar poder
de *"travar a competência da Saúde"* seria **inventar um recorte que o TR 4.52 não tem**.

## Enforcement: PILOTO — e o rollout é rota declarada

`autorizar` roda **só** em `travar`/`destravar`. E o travamento é o piloto **certo**: fechar e
sobretudo **reabrir** um período são atos de **controle**, e é ali que a segregação do 6.4 tem o
maior valor.

⚠️ **Os outros 76 serviços ainda NÃO cobram permissão.** O censo existe, as permissões existem, o
`autorizar` existe — falta **chamá-lo** em cada serviço. Isso é **rota**, não descuido, e o
grep-teste do censo garante que a lista **não envelheça** enquanto ela não chega.

## O seed de usuários mora no `limparBanco` — e é o mesmo argumento de sempre

A partir deste bloco **todo lançamento exige um autor cadastrado**. Isso alcança **49 arquivos de
teste**, e uma cópia do seed em cada um seriam *quarenta e nove lugares para esquecer de um*.

É **exatamente** o argumento do `semearRoteiroOrcamentario` dentro do `criarFichaDeTeste`: o seed
roda de dentro do helper que **toda** fixture já chama.

**O guard funcionou e nomeou:** o primeiro run falhou em 49 testes, listando as **6 identidades**
que o meu censo por grep tinha perdido (`m05b@`, `tributos@`, `almoxarifado@`, `portal@`,
`orcamento@`, `atuarial@`). Foi ele que fechou o próprio censo.

## Pendências NOMEADAS (bloco 2)

- **Rollout do `autorizar`** nos 76 serviços fora do piloto.
- **Segregação de LEITURA por UG** (o outro lado do 6.4) — é camada de **aplicação** (um `where`
  em cada consulta), **não** uma permissão: negar um relatório a alguém não protege nada se ele
  lê o razão por outro caminho.
- **A coluna `competencia`** — ver a correção no topo. Decisão do **5.87/5.88**.
- **`ΣD == ΣC` no funil.**
- **`Usuario` não tem autenticação** — este bloco cadastra **identidade e poder**, não senha nem
  sessão. Quem afirma ser `alice@` não prova nada ao sistema. É camada de aplicação, e é o que
  falta para o 4.55 ficar completo.
