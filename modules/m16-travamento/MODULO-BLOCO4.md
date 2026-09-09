# M16 bloco 4 — autenticação e registro de operação

**TR 4.55** (autenticação) · **6.1** (registro) · **6.2** (resultado) · **6.3** (local da operação).

O bloco 2 cadastrou **identidades**; o bloco 3 amarrou **permissões** a elas. Os dois apoiavam-se
numa palavra: o `criadoPor` que o chamador **afirmava**. Quem escrevesse
`criadoPor: "prefeito@cg.pb.gov.br"` era o prefeito — e todo o edifício da segregação de funções
repousava nisso. Este bloco troca a **afirmação** por uma **prova**.

## 1. A fronteira: a autenticação é da BORDA, e o domínio não a conhece

```
token ──► validarSessao(token) ──► identificador ──► criadoPor do serviço
```

Os **76 serviços continuam recebendo `criadoPor: string`** — nenhuma assinatura mudou, nenhum
teste de negócio foi tocado (**758/758**, os 750 anteriores intactos). Enfiar o token na
assinatura do domínio contaminaria o núcleo com um detalhe de **transporte** e obrigaria cada
teste a fabricar uma sessão para empenhar 1.000 reais.

**Não existe camada HTTP neste repositório** (levantado no passo 0: as dependências de produção
são `prisma`, `pg`, `decimal.js` e `zod` — nada mais). Então a borda nasce como **porta**, e o
teste faz o papel do handler futuro.

## 2. Zero dependência nova — e isso é decisão de segurança

`scrypt` + `timingSafeEqual` + `randomBytes` do **`node:crypto`**. Uma lib de hashing (bcrypt,
argon2) traria binário nativo e uma árvore de dependências para dentro do caminho da
autenticação — o lugar do repositório onde uma dependência comprometida faz o estrago máximo. O
ganho seria marginal; o preço, não. **Qualquer proposta de trocar isto por uma lib PARA e
reporta.**

### ⚠️ O achado do `maxmem` — e ele quebraria o login em produção

`N=2^15 · r=8` exige `128 · N · r` = **exatamente 32 MiB**, que é o `maxmem` **default** do Node.
E ele **falha**: `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` — o limite é batido, não folgado. Sem
`maxmem` explícito (64 MiB), **ninguém autentica**. Medido: **91 ms/hash** — o alvo certo.

O hash é **autodescritivo** (`scrypt$N$r$p$salt$hash`): os parâmetros viajam com ele, e é isso que
permite endurecer o custo amanhã **sem invalidar as credenciais de ontem**.

## 3. Nada é flag. Tudo é derivado — a mesma disciplina do resto do repositório

| pergunta | como se responde | o que **não** existe |
|---|---|---|
| esta sessão vale? | o hash existe · `agora < expiraEm` · não há `SessaoRevogada` · o usuário está ativo | `sessao.valida Boolean` |
| a conta está bloqueada? | `COUNT` de falhas do identificador na janela de 15 min | `usuario.tentativasFalhas Int` |
| qual é a senha vigente? | a `CredencialDeUsuario` de `criadoEm` mais recente | `usuario.senhaHash` (coluna sobrescrita) |

Uma flag `valida` seria uma **quarta verdade** a manter em sincronia com as outras três — e o dia
em que divergisse (a revogação gravada e a flag não), o sistema deixaria entrar quem já tinha sido
expulso, em silêncio. Um contador de falhas **apaga a história**: zerado, ele não diz que houve 4
tentativas às 3 da manhã de ontem.

### A credencial é EVENTO — e isso não contradiz o `ativo` de 498de7b

Aquele bloco manteve `ativo` como **coluna**, argumentando que "cadastro não é fato contábil". A
linha que separa os dois casos é **estado × ato**:

- `ativo` é **estado** que se consulta ("ele pode lançar?"). O ontem dele não interessa.
- **definir senha é um ATO**: tem autor, tem hora, e o histórico **é a prova**. A pergunta do
  controle interno não é *"qual é a senha dele?"* (ninguém pode responder) — é **"quem trocou a
  senha do tesoureiro na véspera do pagamento, e quando?"**. Uma coluna sobrescrita apaga a
  evidência do ato anterior no instante do novo.

## 4. As duas portas da enumeração fecham JUNTAS

Fechar uma só não fecha nada:

- **a mensagem** é idêntica para "usuário não existe" e "senha errada" (`t4` compara byte a byte);
- **o tempo** também: o caminho "não existe" roda o **mesmo scrypt**, contra o `HASH_INEXISTENTE`
  (64 bytes zerados, que nenhuma senha produz). Sem isso, o inexistente responderia em ~1 ms e o
  existente em ~91 ms — e o atacante varreria a lista de e-mails do município **só pelo relógio**,
  sem precisar de mensagem nenhuma. `t7` prova estruturalmente e por ordem de grandeza (uma
  asserção de tempo fina seria flaky, e teste que pisca é teste que alguém desliga).

## 5. O registro de operação grava o que o razão NÃO PODE gravar

O razão já dizia **quem** e **quando** — para os fatos que **aconteceram**. Duas coisas ficam fora
dele, e nenhuma por descuido:

1. **DE ONDE** (`ip`, `agente`). O IP de quem digitou não é dado contábil; é dado de **acesso**.
2. **O QUE FOI NEGADO.** Quando a autorização recusa, **não há fato** — nada é gravado, e é essa a
   promessa do bloco 3 (*"Nada foi gravado"*). Mas a **tentativa existiu**, e é ela que o controle
   interno procura: *quem tentou pagar fora da sua unidade, às 17h de sexta, e foi barrado?*
   **Sem este log, o sistema protege e não conta a ninguém que protegeu.**

O envelope `comOperacaoRegistrada` **re-lança** o erro (não engole nada) e escreve o registro
**fora da transação do ato** — de propósito: dentro dela, o `rollback` da negação levaria o log
embora junto, e o sistema apagaria, no mesmo instante, a prova de que alguém tentou.

## 6. Pendências nomeadas

- **`4.55-reset-de-senha`** — quem pode definir a senha de **outro** usuário ainda não é permissão
  do censo. Ela **não nasceu aqui de propósito**: uma ação nova cairia, por herança, no perfil
  `EXECUCAO` das fixtures (que recebe `TODAS_AS_ACOES` menos as de CONTROLE), e **todo executor
  passaria a poder trocar a senha alheia**. É decisão de **escopo** — do ente —, não de código.
- **`6.3-sessao-no-razao`** — `sessaoId` no `LancamentoContabil` amarraria cada fato ao IP que o
  gerou. É **aditivo** e tem **um** ponto de entrada (o funil, `lancarNoRazao`). Não nasce aqui
  porque exige decidir o que fazer com os fatos que a borda não gera (seeds, backfills, jobs).
- **A janela do cadeado DESLIZA** — a tentativa bloqueada também é registrada. Quem martela mantém
  o próprio cadeado fechado (o certo contra força bruta); o usuário legítimo precisa **parar** por
  15 minutos. A alternativa (não registrar) daria ao atacante tentativas **grátis e invisíveis**,
  e abriria um buraco no log do 6.3 exatamente no momento mais interessante.
