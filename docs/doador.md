# O doador — `doador/saas-municipal`

> ⚠️ **CÓDIGO ABSORVIDO, INERTE POR DECISÃO.** Nada aqui está ligado ao build, ao gate de
> tipos, à suíte ou ao grafo de dependências. `test/inercia-do-doador.test.ts` é quem prova
> que continua assim, e a prova é por mutação.

## 1. O que é, e o que NÃO é

`saas-municipal` **não é o mesmo produto** que `gestao-publica`. É um sistema municipal
multi-tenant construído em outra base tecnológica, absorvido aqui com histórico para que
duas coisas específicas possam ser extraídas depois sem arqueologia.

| | doador | produto |
|---|---|---|
| ORM | Drizzle (`drizzle-orm` 0.38) + `postgres-js` | Prisma 7.8, schema multi-arquivo |
| multi-ente | **um schema Postgres por cliente**, provisionado em runtime | um banco, ente como coluna |
| gerenciador | pnpm com workspaces + turbo | npm, sem workspaces |
| porta do Postgres | 5435 | 5436 |

⚠️ **AS DUAS ÚLTIMAS LINHAS SÃO O QUE O TORNA INERTE NA PRÁTICA.** Ele foi importado **sem
dependências instaladas**, e usa pnpm com workspaces — `npm install` na raiz do produto não
o alcança, e sem `node_modules` ele não roda. Isso é deliberado, não um passo esquecido.

⚠️ **E ELE NÃO SEGUE AS REGRAS DESTE REPOSITÓRIO.** Tem emoji em comentário, compara data
por instante, nomeia coisas em inglês no meio do português. Não é defeito dele: ele nunca
prometeu essas regras. É a razão de os guards deste repositório o excluírem em vez de
cobrá-lo — um guard que acusasse 199 arquivos de terceiro seria desligado na primeira
semana, e é assim que um guard morre.

## 2. O que existe ali

262 arquivos versionados, 27 commits, importados no estado marcado como `doador-v1` na
origem (`f92c2d351ebbbfed57bb2cfd5837fffd7f68d506`, branch `main`).

| área | arquivos | o que é |
|---|---:|---|
| `apps/api` | 65 | REST sobre Fastify, rotas do módulo Folha |
| `apps/web` | 61 | telas Next |
| `packages/database` | 55 | schema Drizzle, **tenancy**, migrations por tenant, seeds |
| `packages/folha-engine` | 39 | **o motor de folha e seus testes** |
| `apps/worker` | 20 | BullMQ, job `processarFolhaMensal` |
| `packages/auth` | 6 | sessão e papéis |
| `docs` | 5 | `ARCHITECTURE.md`, `DECISOES.md`, `MODULOS/folha.md`, `MODULOS/orcamento.md` |

## 3. As duas extrações previstas

⚠️ **SÓ ESTAS DUAS JUSTIFICAM O DIRETÓRIO.** Ele não é um armazém de código útil: é
material de consulta com escopo fechado. Qualquer outra coisa ali é para ser reescrita, não
extraída.

### 3.1 · As golden fixtures do `folha-engine`

**Frente:** a seção 5.12 do catálogo (folha), hoje a maior fatia de código no disco ainda
sem medição — e a única que roda em outro ORM.

**O que se extrai:** os **1.697 linhas de teste** de `packages/folha-engine/test/` — INSS,
IRRF, salário-família, décimo terceiro, faixas progressivas, proporcionalidade, eSocial, e
o `snapshot.test.ts` com o hash fiscal. São casos de cálculo com valores conferidos, que é
a parte cara e a parte que não envelhece: as tabelas mudam por ano, o formato do caso não.

**O que NÃO se extrai:** o motor. Ele fala Drizzle, `number` em vez de `Decimal`, e
compara competência por instante. O produto tem `packages/datas` e os helpers de `Decimal`
do núcleo, e a folha daqui nasce com eles.

⚠️ **A EXTRAÇÃO É TRADUÇÃO DE FIXTURE, NÃO CÓPIA DE ARQUIVO.** Cada caso vira um teste do
produto, com `Decimal` e data civil. Um `.test.ts` copiado inteiro traria as três coisas
acima junto, e passaria — provando o comportamento errado com precisão.

### 3.2 · A referência de provisionamento de schema por cliente

**Frente:** a decisão de arquitetura multi-ente, que continua aberta e que o item 5 de
`ESTADO-EXECUCAO.md` §19 nomeia.

**O que se consulta:** `packages/database/src/tenancy.ts` — `provisionTenant` criando o
schema, aplicando as migrations do diretório gerado e substituindo o placeholder
`tenant_template` pelo nome real, tudo em uma transação; mais `validateSchemaName`,
`migrate-tenants.ts` e `reseed-tenants.ts`.

⚠️ **É REFERÊNCIA, E A PALAVRA É LITERAL.** O produto usa Prisma, e Prisma não provisiona
schema em runtime do mesmo jeito. O que se aproveita é o **desenho**: onde mora o
placeholder, o que entra na transação, o que acontece quando a migration falha no meio, e
como se lista o que existe. Nada disso é código que se copia.

## 4. Como ele foi desligado, e onde isso está escrito

A exclusão foi **medida antes de escrita**. Com o doador importado e nada mais feito:

| instrumento | estado | medida |
|---|---|---|
| varredor `cobertura-de-tsconfig` | **VERMELHO** | 199 descobertos, os 199 em `doador/`, zero fora |
| coleta do vitest (rápida) | verde | 65 arquivos / 722 testes, idêntico |
| coleta do vitest (completa) | verde | 0 arquivos do doador coletados |
| guard de data civil | verde | — |
| guard de tabela morta | verde | — |
| guard de rótulos de conformidade | verde | — |

⚠️ **UM SÓ INSTRUMENTO QUEBROU, E OS OUTROS QUATRO ESTAVAM VERDES POR ANCORAGEM, NÃO POR
DEFESA.** Os scanners deste repositório enumeram raízes por lista branca
(`test/raizes-dominio.ts`) e os `include` do vitest são ancorados (`packages/**`, não
`**/packages/**`). Isso é mais forte que uma exclusão — e mais frágil numa direção: âncora
se perde numa edição de uma linha, e a edição que a perde é a mais natural do mundo (trocar
`packages/**` por `**/packages/**` depois de mover um pacote).

Onde a exclusão está escrita, e o que ela faz em cada lugar:

**Carregadoras** — sem elas, algo fica vermelho ou passa a coletar código de terceiro:

- `test/raizes-dominio.ts` — `DIRETORIOS_INERTES`, e `raizesExistentes` **recusa** raiz
  inerte. É o ponto de estrangulamento por onde o guard de data civil, o de tabela morta e
  o de rótulos obtêm suas raízes: uma linha cobre os três.
- `scripts/cobertura-de-tsconfig.ts` — `IGNORADOS` ganha os inertes. É o único que estava
  vermelho, e estava certo: ele varre o repositório inteiro por construção, que é o que o
  fez achar `middleware.ts` fora dos três tsconfig.
- `test/particao-da-suite.ts` — `IGNORAR` ganha os inertes, para a promessa "a união das
  duas partições é o conjunto inteiro" não passar a valer para os 10 `.test.ts` do doador.
- `vitest.config.ts` e `vitest.rapido.config.ts` — `exclude: ["doador/**"]`.

**Declarações** — não consertam nada hoje, e dizem no arquivo que decide que aquele código
não é para ser compilado ali:

- `tsconfig.json`, `tsconfig.backend.json`, `tsconfig.scripts.json` — `"doador"` no
  `exclude`. Os `include` já são lista branca; a linha é para a próxima que alargar uma raiz.

## 5. O guard, e o que ele acusa

`test/inercia-do-doador.test.ts`, 7 testes:

1. nenhum arquivo fora de `doador/` importa de `doador/`;
2. nenhum `package.json` do produto declara o doador como workspace ou dependência, e não
   há `pnpm-workspace.yaml` na raiz do produto;
3. `doador` não é raiz de varredura de nenhum guard de domínio;
4. os instrumentos que excluem o doador **excluem de fato** — o array `exclude` lido sem
   comentário, o `test.exclude` lido da configuração que o runner usa;
5. a varredura real alcança o produto inteiro (amarração contra vacuidade).

⚠️ **O TESTE 4 NASCEU ERRADO, E A MUTAÇÃO O PEGOU.** A primeira versão procurava a palavra
`doador` no texto de cada instrumento. Ao comentar a exclusão REAL do varredor de cobertura,
ele continuou verde — porque o comentário que EXPLICA a exclusão também contém a palavra.
Estava atestando a exclusão pela papelada que a declara, o mesmo defeito do guard de
`CONQUISTAS` no ENT05. Foi reescrito para afirmar efeito.

## 6. A condição de remoção

⚠️ **ESTE DIRETÓRIO TEM DATA PARA SAIR, E SAI POR COMMIT PRÓPRIO.**

Ele sai quando as **duas** extrações da seção 3 estiverem feitas **e provadas**:

1. as fixtures do `folha-engine` traduzidas para testes do produto, com `Decimal` e data
   civil, rodando na suíte;
2. a decisão de arquitetura multi-ente tomada e registrada em `ESTADO-EXECUCAO.md` — seja
   ela schema por ente, banco por ente ou coluna, e independentemente de qual vença. O que
   fecha esta extração é a DECISÃO estar tomada com esta referência consultada, não o
   desenho do doador ter sido adotado.

Feitas as duas, o commit de remoção apaga `doador/` inteiro e remove, junto, as exclusões
das seções 4 e 5 e este arquivo. **Exclusão sem o código que a motivou é lixo que o próximo
leitor toma por regra.**

⚠️ **E SE UMA DAS DUAS FOR ABANDONADA, ELE SAI IGUAL.** Um diretório preservado "por via
das dúvidas" é um diretório que nunca sai. A origem continua existindo em
`../saas-municipal`, com a tag `doador-v1` no mesmo estado — quem precisar depois, clona de
lá.
