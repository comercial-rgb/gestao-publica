# V21 — continuação em máquina nova: fechar a contabilidade para a apresentação

Escrito em 2026-09-28, ao fim da V20, para a sessão que continua o trabalho em outra máquina.
**Tudo que este documento afirma foi medido nesta sessão**; o que não foi medido está marcado como
tal.

---

## 1. Onde o trabalho está

`HEAD` = `181a344`, **enviado ao GitHub** (`comercial-rgb/gestao-publica`, `main`, 365 commits de
uma vez — era o primeiro envio em mais de duas semanas). Árvore limpa.

⚠️ **Existe um `stash` de OUTRA sessão no repositório** (`wip(v3): liquidacao de material como ato
unico`). Ele está intacto e **não é desta frente** — não rode `git stash pop` sem olhar
`git stash list` primeiro. Aplicá-lo por acidente já criou conflito em 10 arquivos de M05/M10 nesta
obra.

### O veredito que decide se pode apresentar

```
npm run poc:conferir
```

Última corrida: **✅ PODE COMEÇAR — 87/87** (massa 18/18, rotas 36/36, conteúdo 29/29,
contingência 4/4), contra `next start` de build próprio no banco `gestao_publica_apresentacao`.
Ele é leitura pura: pode rodar quantas vezes quiser, inclusive uma hora antes da apresentação.

### O que as duas últimas unidades entregaram

| Unidade | O que passou a existir | Prova |
|---|---|---|
| **V19/C05** — custo por centro | `/contabilidade/custos`: acumulado por centro pela **competência do custo**, e a composição que volta à liquidação, ao empenho e ao credor. A apropriação **não lança no razão** | domínio 14+17, percurso **22/22**, mutação em 3 guards |
| **V20** — virada das classes 5 e 6 | `/contabilidade/virada-dos-controles`: a lista curta das contas com saldo, a sugestão pela doutrina sem aplicá-la, a soma que diz se **fecha** antes do clique, o ato e o **estorno** | domínio **14/14**, percurso **25/25**, mutação em 3 guards |

Na demonstração as duas telas já têm número: o custo por centro tem **600,00 e 400,00** semeados
(`prisma/seed/poc-custos.ts`) com **49.000,00 sobrando na mesma liquidação** para a segunda
apropriação ao vivo; a virada abre com as **6 contas de controle** listadas e sem destino — que é o
estado correto, porque **nenhum seed classifica conta na virada** (a decisão ENCERRA/TRANSFERE é do
ente, e classificar as seis pela tela é um passo de ~1 min que *demonstra* a decisão).

---

## 2. Subir o ambiente na máquina nova — a sequência exata

```bash
# (1) dependências e cliente Prisma
npm ci
npx prisma generate                      # o migrate dev NÃO regenera o cliente aqui

# (2) o Postgres (container sem volume nomeado — ver docs/dependencias-externas.md)
docker start pg-gestao-publica           # se o container não existir, recrie-o e restaure o dump

# (3) o banco de apresentação, do zero (24 passos, ~45 s)
DATABASE_URL_PERCURSOS=postgresql://gestao:gestao@localhost:5436/gestao_publica_apresentacao \
LICENCA_NUMERO=DEMONSTRACAO-SEM-CONTRATO \
LICENCA_CLIENTE='Demonstracao interna (nenhum contrato assinado)' \
npx tsx scripts/preparar-banco-de-percursos.ts

# (4) o build (a válvula é obrigatória enquanto o type-check não couber no build)
npm run tipos:conferir
PULAR_CONFERENCIA_DE_TIPOS_DO_BUILD=1 AMBIENTE_DE_EXECUCAO=demonstracao npx next build

# (5) servir
PERCURSO_BANCO=gestao_publica_apresentacao PERCURSO_COMO_RUNTIME=1 \
PERCURSO_PORTA=3010 AMBIENTE_DE_EXECUCAO=demonstracao \
npx tsx scripts/servir-percursos.ts

# (6) conferir
DATABASE_URL=postgresql://gestao:gestao@localhost:5436/gestao_publica_apresentacao \
npx tsx scripts/poc-conferir.ts --base=http://localhost:3010
```

⚠️ **NUNCA rode percurso contra a 3010.** Os percursos gravam, e os da virada e do encerramento
**travam a competência** — inutilizariam todos os outros passos da demonstração. Clone antes
(`create database X template gestao_publica_apresentacao`), aplique `prisma migrate deploy` e
`scripts/provisionar-papel-runtime.ts` no clone, e sirva na 3011.

⚠️ **Tabela nova nasce sem grant.** O papel `gestao_app` não tem DDL: depois de qualquer
`migrate deploy`, rode `npx tsx scripts/provisionar-papel-runtime.ts` naquele banco, ou a aplicação
responde "permission denied" na primeira leitura.

`CONTINGENCIA/` tem 198 artefatos com manifesto SHA-256 — é o plano B se a aplicação não subir.

---

## 3. A restrição de máquina, e o que muda na nova

Medido nesta sessão, com a máquina praticamente parada:

- **`tsc --noEmit -p tsconfig.json` não cabe em 8 GB.** Estourou o heap em 4.400 MB (49 s) e em
  5.324 MB (116 s). Não é pressão de memória: é **teto de heap**. A causa são os **293 stubs de
  `.next/types/**`**, um por rota, que juntos puxam o grafo inteiro do app.
- A conferência foi **partida em dois recortes** cuja união cobre o mesmo `include`
  (`tsconfig.app-sem-rotas.json` + `tsconfig.rotas-geradas.json`); cada um passa em ~4 s, e a válvula
  do build roda **os dois**, reprovando no primeiro que falhar. `npm run typecheck:app-inteiro` ainda
  roda o projeto inteiro, **para máquina que o comporte**.
- Orçamento medido dos 8 GB: **1,88 GB wired** + **995 MB no compressor**; Cursor com quatro
  extension hosts do projeto = 1.205 MB; a sessão do agente = 506 MB; Docker Desktop = 600 MB.
  Sobravam ~2,5 GB. **Zero processos órfãos.**

**Na máquina nova:** rode `npm run typecheck:app-inteiro` uma vez. Se passar, a partição continua
válida (ela não perde cobertura) mas deixa de ser necessária — e aí vale medir também
`npm run typecheck:scripts`, que **estourou nesta máquina e NÃO foi medido**. É a primeira coisa a
conferir lá, porque é a única medição que esta sessão deixou em aberto.

---

## 4. O que falta para a contabilidade, em ordem de valor para a apresentação

### 4.1 — Alta: o que a Comissão pode perguntar e hoje não tem resposta

| Pendência | O que falta, concretamente |
|---|---|
| **C19 — remanejamento, transposição e transferência** | ausente e confirmado. ⚠️ O desenho já está decidido e registrado: **NÃO** deve ser um quarto `TipoCredito`. Aquele enum governa o que está sujeito ao limite de créditos adicionais, e o art. 167, VI move dotação existente **fora** dele — acrescentar ali faria o remanejamento herdar a lógica do limite em dez sítios que hoje enumeram os três tipos. É ato próprio, com origem e destino |
| **SAGRES: três entidades em 🟡** | cada uma pede **uma coluna de schema**: `EstornoPagamento` sem `motivo` (obrigatório no leiaute), `UnidadeOrcamentaria` sem `nomeSecretario`/`cpfSecretario`/ato, `ConciliacaoBancaria` sem os campos bancários. São decisões de schema, não de código |
| **`DESFAZER-ENCERRAMENTO-INEXISTENTE`** | desfazer o encerramento do exercício e a inscrição dos restos não tem serviço nem tela. O percurso afirma o oposto: encerrar de novo é recusado nomeando |
| **`ESTORNO-DA-APURACAO-SEM-BORDA`** | `estornarApuracao` existe, é censado e pede o id da operação — falta a **listagem de apurações** que o formulário precisaria |

### 4.2 — Média: completa o que já existe

- **`FOLHA-SEM-RATEIO-POR-CENTRO`** — a maior massa de custo de um município é pessoal, e a folha
  fechada não gera apropriação de custo. ⚠️ É unidade **própria**: `apropriarFolha` agrupa por
  grupo/ficha, e mexer naquele agrupamento mexe no **empenho** da folha.
- **`INSCRICAO-DE-RP-SEM-PERNA-NO-RAZAO`** — a inscrição grava `InscricaoRestosAPagar` e não lança
  nas contas `5.3`/`6.3`. Por isso o caso TRANSFERE da virada não tem saldo real em banco nenhum
  deste repositório.
- **`PERCENTUAL-RESIDUAL-LIDO-COM-DUAS-CASAS`** — achado de contrato que vale para código **já em
  produção**: o M10 lê `percentualResidual` (`Decimal(9,6)`) com `toMoney(...toFixed(6))`, e `toMoney`
  arredonda a **duas** casas. Um residual de 0,05 não sofre; um de 0,033333 viraria 0,03. A correção
  é `toPercentual` (`packages/contracts/percentual.ts`, criado na V19) e **não** foi feita porque mexe
  na aritmética da depreciação, que tem suíte própria a reconferir.
- **`BASE-DE-RATEIO-CALCULADA`**, **`CUSTO-POR-PROGRAMA`**, **`DEPRECIACAO-SEM-CENTRO`** — as três
  ampliações do custo por centro, cada uma no `MODULO.md` do M12 com o motivo de não ter sido feita.
- **`APROPRIACAO-MENSAL-DE-DESPESA-ANTECIPADA`** (5.10.1.13) — o diferimento de assinaturas e seguros
  **com lançamento contábil**. É o oposto do custo por centro, e por isso a cláusula ficou marcada
  como ausência em vez de atendida.

### 4.3 — Baixa, mas devida

- o percurso do par **recolher/estornar** extraorçamentário (a borda existe, o par não foi percorrido);
- as **seis acusações herdadas** de `test/ui/fronteira-ui.test.ts` (4 telas importam tipo de
  `modules/**`, 2 ilhas client importam constantes de `lib/portas/recursos/folha`). Nenhuma é das duas
  últimas unidades;
- **`CLAUSULA-DE-QUATRO-GRUPOS-INDISTINGUIVEL`** — o guard de rótulos não distingue `(5.9.1.3)` de um
  prefixo de conta do PCASP pela forma.

---

## 5. As regras que não se negociam, resumidas para quem chega

Leia `CLAUDE.md` inteiro. O que mais custou defeito real aqui:

1. **Dinheiro é `Decimal`** (`packages/contracts`), percentual é `Decimal(9,6)` via `toPercentual` —
   **nunca** `toMoney` para percentual (ele arredonda a duas casas).
2. **Razão append-only.** Correção é lançamento novo. Se um requisito parece pedir `UPDATE` em
   lançamento, o requisito foi lido errado.
3. **Fixture mínima N=2** em toda regra que só se manifesta em conjunto — rateio, fila, lote, estorno
   parcial. Com N=1 a regra passa por vacuidade.
4. **Instrumento nasce com a prova de que acusa:** mute o que ele vigia, confirme vermelho, reverta.
5. **Nada de código no código:** conta do PCASP, alíquota e roteiro vêm de tabela, fail-closed.
6. **Interface:** nenhum identificador de cláusula, selo ou percentual de cobertura em tela; sem
   emoji; rótulo em todo campo. E — aprendido na V20 — **um formulário não pode desaparecer com o
   próprio sucesso**: se a re-renderização o remove, a confirmação vai com ele e o operador lê
   silêncio.
7. **Um processo pesado por vez** enquanto a máquina for apertada; `lsof -ti tcp:PORTA | xargs kill -9`
   para matar servidor, nunca `pkill -f VAR=`.
8. **Marcar ausência vale tanto quanto marcar presença** no catálogo, e só se marca com
   comportamento, teste e evidência.

---

## 6. O comando para a sessão nova

Cole isto como primeira mensagem:

> Leia `CLAUDE.md`, depois `ESTADO-EXECUCAO.md` (a seção "Resumo atual" e a seção "V20"), e depois
> `docs/lotes/V21-continuacao-em-maquina-nova.md`. Confirme primeiro que o ambiente sobe e que
> `npm run poc:conferir` diz PODE COMEÇAR. Depois meça `npm run typecheck:app-inteiro` e
> `npm run typecheck:scripts` nesta máquina e registre o resultado — o segundo estourou na máquina
> anterior e ficou sem medição.
>
> Então siga a fila da seção 4 deste documento, na ordem, em modo autônomo: varredura medida antes de
> construir, domínio com fixture N=2 e negação com motivo, prova por mutação de todo instrumento novo,
> porta, tela, percurso de navegador, marcação de catálogo com evidência, e `ESTADO-EXECUCAO.md`
> atualizado ao fechar cada unidade. Commit local por unidade coerente. Foco 100 % na contabilidade
> para a apresentação de Esperança; a gestão pública completa vem depois.
>
> Sem número de cláusula do termo de referência e sem texto de instrução de código em nenhuma tela.

---

## 7. Bancos descartáveis desta sessão

Podem ser dropados a qualquer momento — nenhum deles é o de apresentação:

```
gestao_publica_isolado_v19_c05   gestao_publica_isolado_v20
gestao_publica_virada_v20        gestao_publica_virada_v20b   gestao_publica_virada_v20c
```

Os dois que importam: **`gestao_publica_apresentacao`** (a demonstração, já com as migrations da V19
e da V20, a v36 de permissões aplicada e o papel de runtime provisionado) e **`gestao_publica`** (dev).
