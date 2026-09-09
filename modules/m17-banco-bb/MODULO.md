# M17 — integração Banco do Brasil (API)

**Gap #4 (API BB)** · **TR 4.12.2** (log de trocas) · **TR 5.72** (painel de extrato/saldo).
Status: **M17-a concluído — SÓ LEITURA** (extrato + saldo). A **escrita** (pagamento, **TR 5.38**)
é o **M17-b**, e não foi tocada aqui.

## Uma origem a mais, e o núcleo da conciliação não muda

O extrato que a conciliação (M09) ingere é `TransacaoOfx[]` — sempre foi. O que este módulo
acrescenta é uma **segunda origem** para esse mesmo tipo: em vez de um arquivo OFX, a resposta da
API do BB, **normalizada para o MESMO tipo**. O núcleo `ingerir` (M09) é um só; cada porta de
entrada (`importarExtrato`, `importarExtratoBb`) autoriza a sua ação e chama o núcleo. A `origem`
(`OFX` | `API_BB`) fica gravada no `ExtratoBancario` — a conciliação é idêntica, a **procedência**
aparece na trilha.

⚠️ **Um dono da forma.** O adapter da API **não** cria um tipo paralelo. Ele constrói o
`TransacaoOfx` do parser de OFX, via o `montarTransacaoOfx` que o `packages/ofx` passou a exportar —
a `linhaCanonica` (base do `linhaHash`) é montada **no mesmo lugar** para as duas origens. Se a
forma do OFX precisar de um campo, é o tipo do OFX que ganha o campo; não há um segundo tipo.

## O que trava sozinho — a homologação é frágil de propósito

A homologação do BB tem **teto de 10 chamadas / 10 minutos** — a 11ª falha. O cliente **recusa a 11ª
localmente**, antes da rede (`RateLimitHomologError` — `RATE-LIMIT-HOMOLOG`), com contador de janela
deslizante e relógio injetável. Retry **só em 5xx** (falha transitória do gateway); **nunca em 429** —
429 é a cota estourada, e retentar só a queima mais rápido: estoura na hora e manda esperar a janela.

O token do OAuth (`client_credentials`) é **cacheado até a margem de expiry** (60s antes) — uma
consulta de extrato + uma de saldo gastam **um** token, não dois.

⚠️ **Env fail-hard.** Falta de credencial estoura `BB-ENV-AUSENTE` **nomeando o que falta**, no boot
do adapter — nunca um default silencioso. As credenciais moram em `.env.local` (gitignored) e
**nunca** são commitadas. O `registrationAccessToken` **não entra no `.env`**.

## O log é cego para o segredo — e um teste prova

**TR 4.12.2**: toda chamada à API gera `RegistroDeOperacao` com o metadado — endpoint (o **path**,
sem a query que leva o `gw-dev-app-key`), período, http status, contagem. **Nunca** token, secret ou
appKey. A garantia é **estrutural**: o `EventoChamadaBb` que o logger recebe **não declara** campo de
credencial algum, e `m17-banco-bb.test.ts` faz o grep da fonte que **falha** se alguém acrescentar um.
Um segundo teste, em runtime, serializa os eventos e prova que o valor do token/secret/appKey **não
aparece** em campo nenhum.

## A suíte nunca toca o BB

`vitest` roda **contra fixtures** construídas do exemplo de resposta da API (fetch injetado). Quem
faz a chamada **real** à homologação é `scripts/bb-smoke.ts` — 1 token + 1 extrato + 1 saldo, **fora
da suíte**, rodado à mão pelo Winner (`npm run bb:smoke -- <agência> <conta>`).

## Idempotência — puxar o mesmo período duas vezes é no-op

O hash de origem da API é o `sha256` das linhas canônicas **ordenadas** — determinístico por período.
Reimportar o mesmo período por API é no-op idempotente, a mesma disciplina do hash do arquivo OFX.
O `fitid` é **sintetizado** (`BB-` + hash de agência/conta/data/valor/indicador/documento/sequência),
porque a API não devolve o FITID do OFX; determinístico, então a dedup **por-origem** funciona.

## Fronteiras declaradas (o que o M17-a NÃO faz)

- **Escrita / pagamento (TR 5.38)** — é o **M17-b**. Aqui só leitura.
- ⚠️ **Cross-origem não deduplica** (Passo 0.c): o FITID do OFX (do banco) ≠ o `fitid` sintetizado da
  API para a **mesma** transação — importar OFX **e** API do mesmo período duplicaria. O mapeamento
  cross-origem é **decisão do Winner**, não do código. Ver `normalizar.ts` e `m09/extrato.ts`.
- **Swagger não confirmado no ambiente**: paths, scopes e nomes de campo da API foram **assumidos** e
  centralizados em `config.ts` (`SPEC_BB`, marcados `CONFIRMAR NO SWAGGER`). O smoke contra a
  homologação real é o que confirma — ajuste o `SPEC_BB` se o BB divergir, e o resto do módulo segue.
- **Tela de conciliação**: o M09 entregou **domínio + porta**, sem UI. A `origem` já é carregada pela
  porta (`ExtratoDaTela.origem`) e persistida na coluna — pronta para a tela que a consumir.
