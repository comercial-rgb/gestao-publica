# ENT08 — o eixo de gestão do bem, pela tela

> Pedido do operador nesta sessão (2026-09-12), na mesma instrução que vem valendo desde o
> ENT06 item 1: **construção contínua** — telas, rotas, botões de ação, execuções e módulos
> integrados —, sem parar para revisão a cada gate. O CLAUDE.md manda parar no gate e
> aguardar revisão; o operador dispensou essa parada explicitamente, e a dispensa fica
> registrada aqui em vez de virar hábito silencioso.
>
> Escrito **antes** do lote começar, como a regra manda.

## O que foi pedido

Seguir a ordem que o operador confirmou: fechar as telas de 5.19 e 5.17, e depois protocolo e
processo digital, portal do servidor, portal do cidadão, frota, fiscalização de contratos e a
frente tributária.

Deste conjunto, este lote pega **o eixo de gestão do bem**: mover o bem que o ENT07 tornou
alcançável.

## Por que este lote vem agora, e por que ele É de superfície pura

O ENT07 entregou o acervo: a classe, o bem, e o cadastro alcançável por um servidor
municipal. O que falta é **movê-lo**. `MovimentoDeGestaoDoBem` está de pé e testado contra
banco desde o ENT05 — localização, responsável, estado de conservação e situação física, cada
um derivado do último movimento do seu tipo —, e **nenhum desses atos tem superfície**.

⚠️ **A NATUREZA VAI DECLARADA, e aqui ela é o oposto da do ENT07.** Aquele foi modelo mais
superfície, porque nada no domínio criava um bem. Este é **superfície pura**, e isso foi
medido, não suposto:

| Pergunta | Resposta | O que decide |
|---|---|---|
| As ações existem no censo? | **sim** — `REGISTRAR_MOVIMENTO_DE_GESTAO` e as demais | sem ação nova |
| Estão mapeadas em `AREA_DA_ACAO`? | **sim**, todas em `patrimonio` | sem alteração no mapa |
| Precisa de coluna ou enum novo? | **não** | **sem migration** |
| O caso de uso está provado? | **sim**, desde o ENT05 | o que falta é tela |

## O que deve entrar

- **Quatro ações no descritor do bem**, uma por eixo: mover localização, atribuir
  responsável, registrar estado de conservação, registrar situação física. Todas com
  `acaoDoCenso: "REGISTRAR_MOVIMENTO_DE_GESTAO"`.
- **Os campos de cada ação**: `dataMovimento` (data — normalizada na fronteira com
  `inicioDoDiaCivil`, pela decisão de §25), `motivo` (texto, obrigatório — o domínio exige ao
  menos cinco letras, "o motivo é o que explica o fato a quem auditar"), e **o campo que o
  `CAMPO_OBRIGATORIO_DO_TIPO` exige daquele tipo**, e só ele.
- **`acaoDoBem(acao, bemId, campos)`** na porta: `switch` com `default` que estoura, cada caso
  em `comEscritaAutenticada`, nenhuma regra de negócio — a recusa do domínio sobe como veio.
- **Duas chaves novas de opção**: `localizacaoId` (localizações ativas) e `responsavelId`.
  ⚠️ `Pessoa` **não tem campo de nome**: o nome vive em `VersaoDePessoa`, e a versão vigente é
  a mais recente. O idioma já existe em quatro lugares do repo — `versoes` com `take: 1`
  ordenado por `criadoEm` desc, filtrando `ativa !== false`, que é a forma do `protocolo.ts`.
  Reinventar a regra de versionamento criaria uma segunda verdade sobre ela.
- **`estado` e `situacao` com opções literais**: são rol fechado do modelo, não cadastro do
  ente. Buscá-las na porta sugeriria que o município pode acrescentar uma sexta conservação.
- **Um percurso de navegador**, com o `entrar` corrigido de §27.3 e o ramo de campo de data
  de §28.2 — os dois defeitos que este par de lotes já pagou.

## O que NÃO entra, e por quê

- **O estorno.** `estornarMovimentoDeGestao` recebe um `movimentoId` e devolve `movimentosId`
  no plural (a transferência estorna as duas pernas). Ele age sobre um movimento **escolhido**,
  e as ações do molde agem sobre o **id do recurso**. Estornar exige ação por linha do
  histórico, que o molde não oferece — e o molde não cresce para acomodar exceção.
  Pendência `ESTORNO-POR-LINHA-DO-HISTORICO`.
- **A transferência entre entidades.** Ato composto, duas pernas sob um `operacaoId`, com
  viabilidade conferida antes de qualquer escrita e recusas próprias. Cabe numa tela, não num
  botão de formulário genérico.
- **Termo patrimonial e etiqueta.** São documentos — território do M22 —, e emitir termo
  REGISTRA movimento na mesma transação. Misturá-los com os quatro eixos faria um formulário
  de "mover de sala" parecer capaz de emitir documento assinável.
- **O inventário de bens.** Exige comissão designada, e `cadastrarComissaoPatrimonial` recebe
  `membros[]` — o molde não tem campo repetidor. Pendência `COMISSAO-COM-MEMBROS`.

## Obstáculos conhecidos antes de começar

- **`Pessoa` sem nome próprio** (acima). Um select montado só com o que `Pessoa` tem seria uma
  lista de CPFs crus — o "formulário bonito e inútil" que a regra nomeia.
- ⚠️ **Pendência nova `ZMOTIVO-DUPLICADO`.** `zMotivo` está definido **treze vezes** no repo —
  m02, m04, m05, m07, m11 (×2) e **sete vezes dentro do próprio m10** — com ao menos dois
  mínimos diferentes (5 e 10). É a mesma família da `ZDIA-DUPLICADO` já nomeada. Consolidar
  toca treze sítios em oito módulos, cada um com sua mensagem: lote próprio, com prova
  própria. Este lote **usa** o do M10 e não mexe nos outros doze.

## Regime de rigor

**Superfície.** O caso de uso já está provado contra banco desde o ENT05 (`CAMPO_OBRIGATORIO_DO_TIPO`
recusa movimento sem o campo do seu tipo, e há teste contando `LancamentoContabil` para provar
que o eixo de gestão não toca o razão). O que este lote deve é o que superfície deve: teste de
autorização no servidor e **um percurso de navegador por família de tela**.

⚠️ **E uma asserção obrigatória no percurso**, porque é a classe de defeito que os dois lotes
anteriores pegaram: depois de mover o bem, **recarregar** e conferir que o histórico mostra o
movimento com as DUAS datas — a do fato e a do registro. Um eixo derivado que não aparece após
recarga é indistinguível de estado de componente.
