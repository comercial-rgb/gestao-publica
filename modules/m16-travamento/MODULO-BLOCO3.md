# M16 bloco 3 — o ROLLOUT da autorização nos 76 serviços

**TR 4.56** (permissões) · **6.4** (segregação de funções) · **6.5** (segregação por unidade
gestora).

O bloco 2 instalou a fechadura e a provou **numa porta só** (o travamento — o piloto). Este
bloco a instala nas outras **76**. Enquanto isso não acontecia, o `autorizar` era uma promessa:
o ente concedia perfis, a lista de permissões existia, e os serviços gravavam sem perguntar
nada a ninguém.

## 1. O CENSO DA UNIDADE GESTORA — e ele é um fato de schema, não uma opinião

`unidadeOrcId` existe em **UMA** entidade do sistema inteiro: `FichaOrcamentaria`
([m02-planejamento.prisma:238](../../prisma/schema/m02-planejamento.prisma#L238)). Não há UG em
conta bancária, contrato, processo, bem, classe de material, dívida, provisão nem receita.

A consequência é fechada: **ou a UG do fato vem de uma ficha — por um caminho de FKs — ou o fato
não tem UG, e é ato do ENTE.** Não existe terceira via, e por isso não existe "UG default":
inventá-la seria carimbar uma unidade num fato que não pertence a nenhuma.

| | serviços |
|---|---|
| **UG derivável** (19) | M02 `criarFicha` (a UG é o objeto do ato) · M05 inteiro (12, via ficha/reserva/empenho/liquidação/pagamento) · M08 restos a pagar (5, via empenho) · M10 `registrarEntradaAlmoxarifado` (via liquidação — TR 5.85) |
| **Ato do ENTE** (50) | M01 lançamento manual · M02 receita prevista · M03 lei/decreto/encerramento · M04 receita inteira · M07 extraorçamentário · M08 exercício e apuração · M09 extrato · M10 patrimônio, dívida, dívida ativa, provisões · M11 licitações, contratos, obras, limites · M12 parametrização |
| **Escopo que segue o fato** (7) | M01 `estornarLancamento` (N UGs) · M03 `executarCredito`/`anularCredito` (N UGs) · M09 `vincular`/`estornarVinculo` · M10 `estornarMovimentoAlmoxarifado`/`estornarMovimentoPatrimonial` |

### ⚠️ ÓRGÃO NÃO É UNIDADE GESTORA

A obra (M11) tem `orgaoId`, e a tentação de usá-lo como UG é grande. Mas **um órgão TEM VÁRIAS
UGs**: derivar a unidade a partir dele daria, na prática, poder sobre todas as irmãs dela. A
obra fica no escopo do ente.

> **Parente deste censo:** o RREO Anexo 7 classifica RP **por Poder e Órgão** com um de-para
> fechado `DeParaOrgaoPoder` (fail-closed). Como aqui, **poder e UG não se derivam um do outro**
> (um órgão tem várias UGs). É a mesma família da pendência [livros-por-ug](../m12-relatorios/MODULO-LIVROS.md);
> quando a segregação por UG amadurecer, os três se encontram.

### ⚠️ O fato que toca N unidades exige poder em TODAS

Um decreto anula 2.000 na Educação para suplementar 2.000 na Saúde: é **UM** ato sobre **DUAS**
unidades. Quem só pode na Saúde não executa "a parte dele" — não existe meia execução, porque o
balanceamento (Σanul == Σsupl) é a razão de o decreto existir, e metade dele gravada seria um
crédito que não fecha. A permissão GLOBAL cobre todas de uma vez; a de uma UG só cobre a sua.

## 2. A PORTA DA AUTORIZAÇÃO — porque metade do repositório é hexagonal

23 dos 76 serviços (M01–M05) não têm `tx` nem `PrismaClient`: a assinatura é `(input, deps)` e a
transação vive dentro do adapter. O `autorizar(tx, ...)` não tinha onde se plugar neles, e passar
o Prisma para dentro desfaria justamente o que os ports foram feitos para impedir.

Então o serviço **pede** a autorização a uma porta ([`porta.ts`](porta.ts)), e o adapter — que já
fala Prisma — responde. **A chamada continua no SERVIÇO**, uma linha, primeira depois do Zod: é
lá que o grep-teste olha, é lá que o revisor lê. Muda quem executa, não onde se declara.

```ts
// hexagonal (M01–M05)
await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.empenhar, { ficha: dados.fichaId });

// prisma-direto (M07–M12) — dentro da $transaction do fato
await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.pagarRestosAPagar, { liquidacao: d.liquidacaoId });
```

### O PREÇO, dito sem maquiagem: a checagem hexagonal roda ANTES da tx do write

A tx nasce no adapter. Existe, portanto, uma janela de milissegundos: se a permissão for
**revogada** entre a checagem e o INSERT, o ato passa. Não é um furo aberto, e é preciso dizer
por quê:

- a permissão **não é um saldo** — duas checagens concorrentes não "gastam" a mesma permissão, ao
  contrário do saldo da ficha (que é o motivo pelo qual os guards de valor foram todos empurrados
  para dentro da transação);
- a **identidade** — a porta que de fato importa contra o usuário revogado — é reconferida DENTRO
  da tx pelo funil (`lancarNoRazao` → `exigirUsuarioAtivo`). Um usuário demitido no meio da
  requisição é barrado lá, com zero escrita;
- fechá-la custaria mover a chamada para dentro de ~30 métodos de adapter, e o grep-teste passaria
  a mirar adapters em vez de serviços.

**PENDÊNCIA NOMEADA (6.5-janela).**

## 3. AS TRÊS CAUSAS DA NEGAÇÃO — "acesso negado" não responde ao TCE

`ACESSO NEGADO` seco manda o servidor pedir a coisa errada e o administrador conceder poder a
mais (a saída fácil é dar a permissão global e acabar com o incômodo — e aí a segregação 6.5
morre por atrito de mensagem). Cada negação nomeia **o que faltou**:

| causa | o que significa | quem resolve |
|---|---|---|
| **O VÍNCULO** | existe, ativo, e sem perfil nenhum. Não pode NADA — é o padrão | vincular a um perfil |
| **A AÇÃO** | tem crachá, mas nenhum perfil concede esta ação **em lugar nenhum** | conceder a ação ao perfil |
| **O ESCOPO** | ele TEM a ação — só não AQUI (e a mensagem diz **onde** ele pode) | estender o escopo (6.5) |

## 4. O COMPOSTO autoriza na BORDA PÚBLICA, UMA vez

`arrecadarRecebimentoDividaAtiva` (M10×M04) abre a transação e chama `registrarArrecadacao` —
**serviço censado** — via `criarM04DepsNaTx(tx)`, com a porta montada **sobre a tx**. Os linkers
(`receberNaTx`, `ingressoNaTx`) estão no `FORA_DO_CENSO`: são pernas do mesmo fato.

Cobrar permissão própria deles seria cobrar duas vezes pelo mesmo ato — e permitiria conceder
**metade** de uma operação atômica (o dinheiro entra, a dívida não baixa), que é pior do que não
conceder nada. Consequência a registrar: **o ente não pode conceder "receber dívida ativa"
separado de "arrecadar"**. É decisão do censo, não esquecimento.

## 5. A CASCATA roda com a autorização DO ATO ORIGINAL

`AoAnularLiquidacaoPort` (M10 → almoxarifado) e `AoAnularArrecadacaoPort` (M10 → dívidas) rodam
**dentro da tx do anular**. Elas correm com a permissão de `ANULAR_LIQUIDACAO` /
`ANULAR_ARRECADACAO`, e **não pedem uma sua**.

Exigir permissão própria partiria a anulação **ao meio**: o razão estornado e o estoque ainda
cheio, numa transação que já não pode voltar atrás. A cascata é **consequência** do ato, não um
ato novo — quem pode desfazer a liquidação está desfazendo tudo o que ela causou; é isso que
"anular" significa. Provado em `t3`.

## 6. O GREP-TESTE, e ele tem as DUAS pontas

O censo (t5) prova que todo serviço **tem** uma ação. Isso não prova nada sobre o *enforcement*:
uma ação declarada e nunca cobrada é uma fechadura pendurada ao lado da porta.

- **t6** — todo serviço do censo **cobra** a autorização. Remover a chamada derruba nomeando
  arquivo e linha.
- **t6b** — a ação cobrada é a **daquele** serviço. É a lição de `498de7b`: sem esta ponta, alguém
  copia o `empenhar` para escrever o `liquidar`, esquece de trocar a ação, e o sistema passa a
  cobrar EMPENHAR de quem liquida. Os dois outros testes ficariam verdes, e a segregação do 6.4
  estaria furada no lugar exato onde foi desenhada para pegar.

Mutação provada nas duas direções, e restaurada.

## 7. O que FICOU DE FORA, e por quê

- **LEITURAS (pendência 6.4-leitura, inalterada).** Negar `balancoOrcamentario` a alguém não
  protege nada se ele lê o razão por outro caminho. A segregação de leitura é um `where` em cada
  consulta — camada de aplicação, não permissão.
- **`criadoPor` da LOA (pendência autor-da-LOA).** `criarFicha` e `criarReceitaPrevista` eram os
  únicos atos que **ninguém assinava**. O `criadoPor` entrou no input (não se pergunta "ele pode?"
  sem saber quem é "ele"), mas **não é persistido**: `FichaOrcamentaria` não tem coluna de autor, e
  criá-la exige migração — outra decisão, que não foi pedida.
- **A janela do check-then-act hexagonal (pendência 6.5-janela).** Ver §2.
- **Livros por unidade gestora (pendência livros-por-ug — cruzada).** O `LancamentoContabil` não
  carrega UG (a dimensão vive na ficha, não na partida — este censo). Por isso os livros
  obrigatórios (Diário/Razão/Balancete, `m12-relatorios/livros.ts`) nascem **consolidados**, sem
  parâmetro de UG: derivá-la de cada lançamento exigiria caminhar até a ficha das partidas, e nem
  todo lançamento tem ficha (o manual puro, o patrimonial em lote). Um parâmetro `unidadeGestora?`
  que não filtrasse nada seria **parâmetro morto**. Os dois documentos apontam um para o outro:
  fechar esta pendência é a mesma decisão que dar UG ao lançamento. Ver o cabeçalho de
  `m12-relatorios/livros.ts`.

## 8. As fixtures: a herança cobriu, e o onipotente é de TESTE

`limparBanco` já semeia o perfil **ADMIN** (global, todas as ações) e vincula a ele **todas as
identidades das fixtures**. Como a permissão global cobre qualquer unidade, **nenhum teste de
integração precisou de toque por causa de permissão** — os 737 passaram intactos.

Os únicos toques foram de outra natureza: três `deps` montados à mão (testes unitários, sem
banco) ganharam o stub `autzQuePermiteTudo` — e a porta é **obrigatória** no `M0xDeps` justamente
para que a permissividade fique **escrita**, e não seja o silêncio de um campo que ninguém
preencheu.

`t5` varre `prisma/seed/` e **falha** se um perfil, usuário ou permissão vazar para o seed de
produção: o dia em que o onipotente escapar para lá, o ente ganha um superusuário que ninguém
pediu, entregue a quem rodar `npm run seed`.
