# M16 — travamento de competência

**TR 4.52** (travamento mensal ou por data) · **TR 4.53** (bloqueio de lançamentos por
período) · **TR 4.54** (bloqueio/desbloqueio por usuário). Status: **bloco 1 concluído**.

## O funil veio primeiro — e ele não existia

O travamento é uma regra que vale para **todo fato**. Isso exige um ponto único por onde todo
fato passe. **Não havia.** `LancamentoContabil` era criado em **19 pontos, em 9 módulos**,
cada um chamando `tx.lancamentoContabil.create()` por conta própria.

⚠️ **Um travamento que cobre 18 dos 19 caminhos é PIOR do que nenhum**: ele dá ao gestor a
certeza de que o mês está fechado enquanto o razão continua se movendo pela porta esquecida.
Por isso o bloco começou pelo funil.

| módulo | pontos migrados |
|---|---|
| M01 `adapter-prisma` | 1 |
| M04 `adapter-prisma` | 1 |
| M05 `adapter-prisma` · `dotacao-razao` | 2 |
| M07 `extraorcamentario` | 1 |
| M08 `restos` · `apuracao` · `encerramento-controles` | 7 |
| M10 `almoxarifado` · `provisoes` · `divida` · `divida-ativa` · `patrimonio` | 7 |
| **total** | **19 → `lancarNoRazao`** |

**Zero mudança observável.** Os 716 testes que existiam passaram **sem um literal alterado** —
era a condição do refactor: qualquer literal que mudasse seria sinal de comportamento alterado.

### O grep-teste é o que MANTÉM o funil sendo funil

`m01-funil.test.ts` varre o repositório e **falha** se `lancamentoContabil.create` (ou
`createMany`) aparecer fora de `m01/razao.ts`, nomeando arquivo e linha.

Sem ele, o **20º escritor** — o do próximo módulo — chama o `create` porque é o que os outros
19 faziam, e **reabre o furo em silêncio**. ⚠️ E o sintoma **só aparece no TCE**: nenhum teste
de negócio quebra (o balancete fecha, a MSC fecha). O que quebra é a **promessa** — e ela só é
cobrada quando alguém pergunta por que março se mexeu depois de fechado.

**Provado por mutação:** um `create` plantado no M10 derruba o teste, nomeando
`modules/m10-patrimonial/provisoes.ts:209`.

Os **testes ficam de fora do grep**, deliberadamente: uma fixture que grava direto está
*driblando o serviço* de propósito — é assim que este repositório prova o índice único de
duplo estorno (M01), a fonte ambígua do resolver (M14) e a conferência pós-evento (M08). O
funil é uma promessa sobre o **código de produção**; um teste não é um caminho do usuário.

### O que o funil NÃO faz (escopo declarado)

Ele **não** valida `ΣD == ΣC` por subsistema — isso mora hoje nos **chamadores** (o
`validarLancamento` do motor puro). Consolidá-la aqui mudaria o comportamento de 19 lugares
num bloco que promete não mudar literal nenhum. É o **candidato natural** do funil, e fica
nomeado.

## Uma tabela, três requisitos

Parecem três coisas e são uma só: uma **janela** de datas do fato, um **escopo** (todos ou um
usuário) e um **sentido** (travar/destravar).

- 4.52 mensal → janela = o mês · escopo global
- 4.52 "por data" / 4.53 "por período" → janela = intervalo · escopo global
- 4.54 por usuário → qualquer janela · escopo = um autor

Três tabelas seriam três verdades sobre *"este fato pode ser lançado?"*.

**Estado DERIVADO, nunca flag.** Não existe coluna `travado`: destravar **não apaga** a trava,
acrescenta um evento. O histórico fica — com motivo e autor —, e é ele que responde ao TCE a
pergunta que sempre vem: *"quem reabriu março, e por quê?"*.

## A precedência: usuário VENCE global

```
TRAVAR global 2026-03  ·  DESTRAVAR alice 2026-03

fato de 15/03 da ALICE -> escopo USUÁRIO vence -> passa
fato de 15/03 do BOB   -> sem evento dele -> cai no global -> rejeita
```

⚠️ **Não é "o mais restritivo vence"** — aí a alice também travaria, e o *desbloqueio* por
usuário do 4.54 não serviria para nada. ⚠️ **Não é "o mais recente vence, ponto"** — aí um
`TRAVAR` global posterior apagaria o desbloqueio da alice no meio da correção que alguém
autorizou.

Dentro de cada escopo, o **último** evento decide. **Sem evento = destravado**: o sistema nasce
aberto; travar é um **ato**.

## O corte é a `dataTransacao` — a data do FATO

Travar janeiro trava os **fatos** de janeiro, não o que foi **digitado** em janeiro. É o mesmo
corte que a MSC, a DVP e o Balanço usam para **ler** — e o travamento tem de proteger
exatamente o número que esses relatórios publicam.

### ⚠️ E daí saem DUAS semânticas de estorno, e as duas estão certas

Um estorno carrega a data do **ato de anular**, não a do fato original. Com dezembro travado:

| | resultado | por quê |
|---|---|---|
| anular em **janeiro** um empenho de dezembro | **PASSA** | o estorno é um fato de **janeiro**. O saldo publicado de dezembro **não se move** (o teste prova: `C_EMPENHADO` no corte 31/12 = 6.000,00 antes **e** depois). Barrar isso impediria o ente de corrigir em janeiro um erro de dezembro — que é justamente o que ele tem de fazer. |
| o mesmo estorno **retroagido** para 20/12 | **REJEITA** | aí ele **é** um fato de dezembro, e mexeria no número já fechado. |

O guard não pergunta *"o que este lançamento desfaz?"* — pergunta **"quando ele acontece?"**.
Uma regra, dois casos, zero exceção.

## `ENCERRAMENTO` é isento — por design

A **virada do exercício** (apuração do resultado + encerramento dos controles) lança em
**31/12**, dentro da competência que o ente acabou de travar. É a ordem natural: fecha-se
dezembro e **só então** se apura.

Se não fosse isenta, **travar dezembro tornaria o encerramento do exercício impossível** — e o
ente teria de destravar dezembro para poder encerrá-lo, o oposto do que o TR quer.

E a isenção é **segura**: o encerramento não é fato novo, ele **transfere** (3/4 → PL, 5/6 →
zero). Não cria receita nem despesa — é por isso que a MSC agregada o exclui e a DVP também. O
travamento protege o **movimento** do mês; o encerramento não é movimento.

⚠️ **E repare no encaixe:** as **duas** únicas funções do repositório que datam o estorno com a
data do **original** (`estornarApuracao` e `estornarEncerramentoControles`) são exatamente as
duas que nascem `ENCERRAMENTO`. Elas retroagiriam para 31/12 — e são isentas. O desenho fecha
sozinho.

## Não há lock — e isso é uma CONCLUSÃO

O `ORDEM_DOS_LOCKS` existe para o padrão **soma-decide-grava**: duas transações leem o mesmo
**saldo**, as duas o acham suficiente, as duas o consomem, e o saldo estoura.

**O travamento não tem saldo.** Não é recurso consumível: dois `travar()` concorrentes gravam
dois eventos, e os dois são válidos (append-only, o mais recente decide). Nada estoura. Um lock
no caminho por onde passa **todo** lançamento do sistema seria cerimônia cara.

**A semântica da corrida, e é a única que um banco pode dar:**

- trava **commitada antes** da leitura do guard → o lançamento a **vê** e é **rejeitado**.
  (Provado: 5 lançamentos concorrentes, os 5 rejeitados, zero escrita.)
- trava commitada **depois** da leitura → aquele lançamento **passa**. E está certo: no instante
  em que foi verificado, a trava **não existia**.

O que o travamento promete é: **depois que a trava existe, nada mais entra.** É isso que ele
cumpre.

## Pendências NOMEADAS (bloco 1)

- ~~**`usuarioAlvo` é string livre**~~ ✅ **CURADO** no bloco 2.
- ~~**A coluna `competencia` é escrita e nunca lida**~~ ⚠️ **ESTA AFIRMAÇÃO ERA FALSA.** Ver a
  correção no bloco 2.
- **`ΣD == ΣC` no funil** — o candidato natural do funil.

---

## `BOOTSTRAP-VS-GUARD-SEED` — pendência (nomeada na 7.2)

A 7.2 tentou criar `prisma/seed/bootstrap-usuario.ts` (o primeiro admin de uma
instalação). O **t5 de `m16-rollout.test.ts` barrou**, e o guard está certo: ele varre
`prisma/seed/` e exige silêncio total sobre `prisma.perfil`, `prisma.usuario`,
`vinculoUsuarioPerfil` e `permissaoDePerfil`, porque

> um seed que carimba um superusuário no banco de produção entrega a chave-mestra a
> quem rodar `npm run seed`.

O arquivo foi **removido**, não contornado. Mudá-lo de pasta para escapar da varredura
foi **vetado em definitivo**: burlar o grep é pior do que afrouxar o guard, porque
esconde a violação.

### O conflito real, e por que ele não é o guard estar errado

**Seed** é rotina re-executável; **bootstrap** é ato único de instalação. O t5 está
certo sobre o primeiro e **mudo sobre o segundo** — e alguém sempre terá de criar o
primeiro usuário. Hoje um banco novo tem zero usuários e a UI inteira vive atrás de
`exigirSessao()`: o sistema fica atrás de uma porta cuja chave não existe.

### O desenho da 7.2-b (decidido — o rol cresce por DECISÃO, não por conveniência)

O guard **evolui, não afrouxa**: ganha uma exceção nomeada com condições **mais duras**
que o original.

- o t5 passa a permitir **exclusivamente** `prisma/seed/bootstrap-usuario.ts` —
  allowlist de UM arquivo, nomeado no próprio teste, com a justificativa;
- nasce um **t5b** que valida as propriedades de segurança do bootstrap:
  1. **recusa-se a rodar se `count(Usuario) > 0`** — fail-closed. Em produção povoada
     ele é **inerte**, e o vetor do t5 deixa de existir;
  2. senha só de `SEED_ADMIN_SENHA`, fail-hard se ausente ou < 12;
  3. zero senha literal no arquivo;
  4. o usuário criado **não** usa o perfil ONIPOTENTE de fixture — cria um ADMIN
     próprio, com as permissões do censo, nomeado.

⚠️ A condição (1) **substitui a idempotência**: bootstrap de primeiro acesso não é
idempotente, é **único**. Segunda execução num banco com usuário deve **FALHAR
nomeando**, não passar em silêncio.

Isso inverte o risco: quem roda o seed num banco povoado não ganha nada; quem instala
do zero ganha exatamente o que uma instalação exige.

### ✅ QUITADA na 7.2-b (sobre `adfbeee`)

O bootstrap nasceu em `prisma/seed/bootstrap-usuario.ts`, e o **t5 evoluiu em vez de
afrouxar**: allowlist de **um** arquivo, com a justificativa escrita no próprio teste,
e um **t5b** que cobra o preço da exceção — no arquivo (grep) e na execução.

O que o t5b verifica: a trava `count(Usuario) > 0`; `SEED_ADMIN_SENHA` com fail-hard
(inclusive na borda do limite, 11 caracteres); zero senha literal; zero import de
`test/`; recusa nomeada contra banco povoado **sem gravar nada**; e, contra banco
vazio, a criação de exatamente 1 usuário + 1 perfil — próprio, não o onipotente de
fixture — com as permissões vindas do censo.

**`criadoPor` do primeiro usuário: auto-referência.** O schema não tem FK ali (é
String), então marcador e auto-referência gravariam igual. Mas a convenção do sistema é
que `criadoPor` nomeia uma identidade que **existe** — é por ela que
`exigirUsuarioAtivo` procura o autor de qualquer fato. Um `"SEED_BOOTSTRAP"` seria o
único `criadoPor` do banco a não resolver para usuário nenhum: um autor-fantasma, e a
auditoria teria de aprender uma exceção. A auto-referência diz a verdade — o primeiro
usuário nasce com a instalação, e não há autor anterior a ele.

O hash é o **do domínio** (`definirSenha` → scrypt): um hash "de seed" com custo próprio
seria uma senha de segunda classe.

---

# 7.13 — Administração de usuários (o domínio), e a pendência que ela carrega

`servico-usuarios.ts` dá os seis atos que a borda pedia desde a 7.12: **criarUsuario**,
**concederPerfil**/**revogarPerfil**, **ativarUsuario**/**inativarUsuario**, **resetarSenha**.

## Reuso, não duplicação

A senha passa sempre por `definirSenha` (o mesmo scrypt e a mesma revogação de sessões do
bootstrap e da troca-a-própria); `resetarSenha` é uma casca nomeada sobre ele — o admin define a
temporária e **as sessões do ALVO caem, as do admin não** (`definirSenha` revoga o `usuarioId`,
nunca o `criadoPor`). `inativarUsuario` faz `ativo=false` **e** derruba as sessões do alvo na MESMA
transação (a doutrina do "um fato, não dois"): para isso o `revogarSessoesNaTx` virou exportado.

## As recusas são NOMEADAS, não silêncio

Cada ato recusa o no-op com mensagem: email duplicado, senha curta, perfil já concedido / não
concedido, usuário já ativo / já inativo. E `inativarUsuario` recusa a **auto-inativação** — o
último admin não se tranca fora, "a porta trancada por dentro com a chave do lado de fora". Conceder
= create, revogar = **DELETE** (o `VinculoUsuarioPerfil` não tem campo de revogação — a concessão é
o fato, a ausência é a revogação).

## ⚠️ AUTORIZACAO-ADMIN-SEM-CENSO — por que estes atos NÃO cobram o censo (ainda)

O Passo 0 da 7.13 achou a trava: a ação de um serviço vive em `PermissaoDePerfil.acao`, que é um
**enum do Prisma** (`AcaoDoSistema`). As seis ações novas (`CRIAR_USUARIO`, …) exigiriam valores
novos no enum → uma **migração**, e o schema/migrações da sessão eram **INTOCÁVEIS**. Sem os valores,
`autorizar` não tem o que cobrar (`permissoes.where({ acao })` rejeita string fora do enum).

Decisão (com o Winner): entregar o **domínio** — os atos, testados, com as recusas e a revogação de
sessões provada — e **adiar a autorização**. Os serviços checam a **identidade** do ator
(`exigirUsuarioAtivo`), não o **poder**. Estão em `FORA_DO_CENSO` por PENDÊNCIA (o mesmo lugar e o
mesmo tipo de nota do `definirSenha`/4.55), e **a borda ainda não os expõe** — uma tela ligada a um
ato sem fechadura seria a porta que o `m16-censo` inteiro existe para impedir.

**A próxima sessão** (schema liberado) adiciona os 6 valores ao enum + 1 migração, move os serviços
de `FORA_DO_CENSO` para `ACAO_DO_SERVICO` com a família `ADMINISTRACAO`, troca `exigirUsuarioAtivo`
por `autorizar`, e escreve o teste de não-herança (nenhuma ação administrativa no perfil de execução
padrão) + a borda (F3 da 7.12). Nada disso muda os atos — só passa a cobrá-los.

---

# 7.14 — O censo da administração: a família ADMINISTRACAO cobra o poder

A 7.13 entregou os atos e adiou a autorização (`AUTORIZACAO-ADMIN-SEM-CENSO`). A 7.14 **quitou** a
pendência com a exceção cirúrgica de schema que ela mesma nomeou.

## O que mudou

- **Enum + migração** (a única edição de schema): os 6 valores (`CRIAR_USUARIO`, `CONCEDER_PERFIL`,
  `REVOGAR_PERFIL`, `ATIVAR_USUARIO`, `INATIVAR_USUARIO`, `RESETAR_SENHA`) entraram no enum
  `AcaoDoSistema` por uma migração ADITIVA e SEPARADA (`ALTER TYPE … ADD VALUE`, o par do
  reconhecimento/programação — no Postgres o ADD VALUE não roda na mesma tx que o usa).
- **Censo**: os 6 serviços saíram de `FORA_DO_CENSO` e entraram em `ACAO_DO_SERVICO`; cada um troca
  `exigirUsuarioAtivo` por `autorizar(prisma, criadoPor, ACAO_DO_SERVICO.x)` — a primeira instrução
  depois do Zod. O `t6` do censo agora prova que cada um cobra a SUA ação. Contagens do `t5c`:
  88 → **94** serviços, 85 → **91** ações (os 6 são distintos, atualizado pela aritmética).
- **O 4.55 saiu da nota do `definirSenha`**: ele volta a ser autenticação pura (a mecânica
  compartilhada da senha); o reset de terceiro é o `resetarSenha`, autorizado por `RESETAR_SENHA`.

## A família ADMINISTRACAO e a NÃO-HERANÇA

`ACOES_DE_ADMINISTRACAO` (em `acoes.ts`) é a família — como `ACOES_DE_CONTROLE`. O perfil de
execução das fixtures agora EXCLUI as duas famílias: quem empenha não fecha o mês (controle) **nem**
administra usuários (administração). O teste `m16-borda-usuarios.test.ts` prova, pela BORDA:

- o perfil de EXECUÇÃO não tem NENHUMA ação de administração (não-herança);
- o **admin do bootstrap é a exceção NOMEADA**: o superusuário de instalação tem todas — é ele que
  distribui os crachás, não herança;
- um executor autenticado que tenta `RESETAR_SENHA` é **NEGADO nomeando** e a tentativa fica
  auditada como `NEGADO` (não `ERRO` — a distinção que o controle filtra);
- o admin consegue, a operação fica `SUCESSO`, o token do ALVO morre e o do admin sobrevive (a prova
  da 7.13, agora pela borda).

## A borda (F3) — a tela que a 7.12 deixou pronta

`administracao/usuarios` ganhou escrita: criar usuário (a senha inicial aparece UMA vez no resultado,
para o admin entregar — NUNCA logada; o audit registra a ação, não a senha), conceder/revogar perfil,
ativar/inativar e resetar senha — cada uma `comEscritaAutenticada` com a ação nova. ⚠️ A
**troca-obrigatória no primeiro acesso segue NOMEADA** (é campo de schema, fora desta exceção): o
interruptor da página diz ao admin para orientar a troca; o sistema ainda não a força.
