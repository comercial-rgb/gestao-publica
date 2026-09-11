# Estado da execução

> Produzido por ENT00 em 2026-09-09, atualizado por **ENT01** e por **ENT02**.
> Dados reais, medidos nesta máquina. Sem estimativa, sem percentual de
> cobertura, sem "provavelmente".
>
> ⚠️ **ENT02 CHEGOU AO GATE.** A definição de concluído da seção 6 do prompt do lote
> está atendida item a item (tabela abaixo), com a cadeia percorrida **pela
> interface** e conferida por smoke de navegador: **43 passos, 0 falhas** (eram 37 no
> gate; o fechamento acrescentou os 6 passos dos anexos).
>
> ⚠️ **ENT03 ABERTO E PARADO NO GATE PARCIAL (2026-09-10).** A caracterização foi feita
> e é o entregável principal deste ponto: `docs/caracterizacao/`. A tesouraria ganhou lote
> de pagamento, borderô e retorno bancário. **A maior parte do prompt do ENT03 NÃO foi
> executada** — a seção 12 lista item a item o que ficou, sem eufemismo.
>
> ⚠️ **FECHAMENTO DO ENT02 (2026-09-10, tarde).** Quatro itens pedidos na revisão do
> gate foram entregues em commits separados, com a suíte verde antes e depois de cada
> um: a superfície dos anexos, a idempotência do smoke de pessoas, a trava de
> concorrência da suíte e a prova dos formulários na mesma página. A seção 10 conta o
> que cada um era e o que mediu.
>
> ⚠️ **E O GATE CONTINUA NÃO SIGNIFICANDO "TUDO PRONTO".** Dos 22 testes mínimos do
> lote, **21 estão cobertos e 1 não coberto** (o eixo município, do lote de tenancy).
> O item 4 saiu de parcial no fechamento. O inventário item a item é um TESTE
> (`test/lote-ent02.test.ts`), não uma tabela, e o placar vai para a saída da suíte a
> cada execução.
>
> ⚠️ **E ESTES NÚMEROS FORAM CORRIGIDOS.** A primeira versão deste cabeçalho dizia
> "17 cobertos, 2 parciais, 3 não cobertos" — escritos de memória, antes da conferência
> item a item, e errados. Ficam registrados aqui porque um documento que corrige em
> silêncio ensina a próxima pessoa a confiar no número sem conferir.
>
> As pendências nomeadas estão nos `MODULO.md` de cada módulo e em
> `components/ui/MODULO-UI.md`.

## Identificação

| Campo | Valor |
|---|---|
| Último lote concluído | **ENT02** — capacidades transversais exercitadas por documentos reais (no gate, aguardando revisão) |
| Data e hora | ENT01: 2026-09-09 13:17 · **ENT02: 2026-09-10, 06:10 (UTC-4)** |
| Repositório de trabalho | `/Users/winnervinicius/Developer/gestao-publica` |
| Commit | commit de encerramento de ENT00, sobre `116e1ca` (cópia da origem). O hash exato deste commit está em `git log -1` — não é repetido aqui porque um documento que cita o próprio hash muda o hash ao ser corrigido |
| Branch | `main` |
| Origem | `/Users/winnervinicius/Developer/siafic-cg` @ `91df4d3` |
| Executor | sessão local, sem push, sem deploy, sem transmissão externa |

## Ambiente verificado

| Item | Valor | Verificado em |
|---|---|---|
| Node | v20.20.0 | 2026-09-09 |
| Gerenciador de pacotes | npm 10.8.2 (`npm install`, exit 0) | 2026-09-09 |
| Postgres desenvolvimento | `localhost:5436/gestao_publica` — PostgreSQL 18.6, container `pg-gestao-publica` | 2026-09-09 |
| Postgres teste | `localhost:5436/gestao_publica_test` — **database distinto**, mesmo servidor | 2026-09-09 |
| Redis | **não aplicável** — o `siafic-cg` não tem dependência de Redis | 2026-09-09 |
| Migrations aplicadas até | ENT00: **63**. ENT01: **68**. ENT02: `20260910050000_m21_acoes_de_cadastro` (**80**), nos dois bancos | 2026-09-10 |
| `prisma/sql/` aplicado | **sim — 17/17 arquivos**, nos dois bancos | 2026-09-09 |

### Portas — por que 5436

| Porta | Ocupante | Origem |
|---|---|---|
| 5432 | Postgres nativo | máquina |
| 6379 | Redis nativo | máquina |
| 5434 / 5435 / 6380 | containers do `saas-municipal` | outro projeto |
| **5436** | `pg-gestao-publica` | **este projeto** |

Os serviços nativos escutam no loopback e vencem de um container publicado em
`0.0.0.0:5432` — o sintoma é `role "..." does not exist`, que parece erro de
credencial e não é. A faixa 5436 evita a colisão inteira.

## Comandos executados neste lote

| Comando | Repositório | Resultado | Duração | Data |
|---|---|---|---|---|
| `npm install` | gestao-publica | exit 0 · 15 vulnerabilidades relatadas (6 moderadas, 8 altas, 1 crítica) — **não corrigidas de propósito**, ver pendências | — | 2026-09-09 |
| `npx prisma generate` | gestao-publica | Prisma Client 7.8.0 gerado | 0,4 s | 2026-09-09 |
| `npx prisma migrate deploy` | gestao-publica (dev) | 63 migrations aplicadas | — | 2026-09-09 |
| `npx prisma migrate deploy` | gestao-publica (teste) | 63 migrations aplicadas | — | 2026-09-09 |
| `npm run db:sql` | gestao-publica (dev e teste) | 17/17 arquivos aplicados | — | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.backend.json` | gestao-publica | **exit 0, limpo** | 7,7 s | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.json` | gestao-publica | **exit 0, limpo** | — | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.scripts.json` | gestao-publica | **exit 0, limpo** | — | 2026-09-09 |
| `npx vitest run` | gestao-publica | **129 arquivos, 1288 testes, 1288 passando, 0 falhas, 0 skips** | 277,8 s | 2026-09-09 |
| `npx vitest run` (regressão pós-lote) | gestao-publica | **130 arquivos, 1303 testes: 1302 passando + 1 falha esperada** — o arquivo novo de invariantes entrou e nada regrediu | 312,2 s | 2026-09-09 |
| `pnpm typecheck` | saas-municipal | 6/6 pacotes | 53 ms (cache) | 2026-09-09 |
| `pnpm test` | saas-municipal | 5 arquivos, 28 testes, todos passando | 8,2 s | 2026-09-09 |
| `pnpm -C packages/folha-engine test` | saas-municipal | 10 arquivos, 81 testes, todos passando | 3,9 s | 2026-09-09 |
| `pnpm -C apps/worker test` | saas-municipal | 4 arquivos, 7 testes, todos passando | 0,5 s | 2026-09-09 |
| `pnpm smoke` | saas-municipal | **8 ok, 2 avisos, 0 falhas** | — | 2026-09-09 |

### Comandos de ENT01 (esta máquina, banco `localhost:5436`)

| Comando | Resultado | Duração | Data |
|---|---|---|---|
| `npx prisma migrate deploy` (dev e teste) | **68 migrations** aplicadas nos dois bancos | — | 2026-09-09 |
| `npm run db:papel` | `gestao_app` provisionado nos dois bancos, **schema `public`** — sem superusuário, sem BYPASSRLS, sem DDL | — | 2026-09-09 |
| `npm run seed:pcasp` · `seed:m02` · `seed:roteiro-orc` · `seed:m07` | plano de contas, classificações da STN, roteiro orçamentário e tipos de consignação | — | 2026-09-09 |
| `SEED_IDENTIDADE=… npm run seed:cenario-aceite` | ficha 1 com **10.000,00** (o §2.4) e ficha 2 de reexecução | — | 2026-09-09 |
| `npm run db:conceder ADMINISTRADOR PREPARAR_ORDEM_PAGAMENTO …` | 3 ações concedidas — ver o achado do funil de autorização | — | 2026-09-09 |
| `npx tsc --noEmit` (backend · app · scripts) | **exit 0, os três limpos** | — | 2026-09-09 |
| `npx next build` | **compilado, 0 erros** | 5,1 s | 2026-09-09 |
| `npx vitest run` | **144 arquivos, 1441 testes, 0 falhas** | ~340 s (máquina livre) | 2026-09-09 |
| `npm run smoke:visual` | **22/22 rotas** · CSS medido no navegador | — | 2026-09-09 |
| `npm run smoke:pessoas` | **9/9 passos**, 0 falhas | — | 2026-09-09 |
| `npm run smoke:cadeia` | **23/23 passos**, 0 falhas | — | 2026-09-09 |

⚠️ **A rota real até aqui não foi reta, e as curvas estão registradas** — cada uma
na seção que a explica: o `FOR UPDATE` que o papel restrito recusou; o seed do
roteiro orçamentário que não existia em produção; a conta de passivo que vinha do
chamador; o teste que passava pelo motivo errado; a ação nova que não alcançou o
perfil existente. Nenhuma delas apareceria num relatório de "tudo verde".

Nenhuma falha de negócio no baseline. Os 2 avisos do smoke são de ambiente:
`API_URL` não definida (check pulado) e o tenant `santa-izabel-oeste` sem vínculo
ativo cadastrado. Nenhum dos dois indica defeito de código.

**A suíte do `siafic-cg` nunca havia sido executada** segundo o handoff. Foi
executada agora, na cópia, e está verde. Isso mede o que a base garante — não
converte nenhuma cláusula do catálogo em atendida.

## O que passou a funcionar

Este lote não entrega funcionalidade de produto. Entrega o direito de mexer no
código sem destruir nada, e a primeira medida honesta do que existe.

| Capacidade | Onde | Como verificar |
|---|---|---|
| `siafic-cg` sob controle de versão | `/Users/winnervinicius/Developer/siafic-cg` | `git log` → `91df4d3`, 756 arquivos versionados |
| Cópia de trabalho versionada | `/Users/winnervinicius/Developer/gestao-publica` | `git log` → `116e1ca`; `diff -rq` contra a origem: idêntico |
| Ambiente reproduzível | container `pg-gestao-publica` na 5436 | `docker ps`; `npm run db:sql` reaplicável |
| Banco de teste fisicamente isolado | `gestao_publica_test` | o guard aborta se a URL de teste coincidir com a de dev |
| Baseline executável | suíte inteira | `npx vitest run` → 1288 testes |
| Invariantes medidos por violação | `test/invariantes-nucleo.test.ts` | `npx vitest run test/invariantes-nucleo.test.ts` |
| Inventário de integrações | `docs/dependencias-externas.md` | 23 integrações, 0 credenciais, 0 convênios |

## Invariantes verificadas neste lote

`test/invariantes-nucleo.test.ts` — 15 testes: 14 passando, 1 falha esperada.

| Invariante | Teste que a viola | Resultado |
|---|---|---|
| Dinheiro em Decimal | partida com `valor` float nativo chegando ao motor | **recusado** — o motor quebra em vez de converter na dúvida |
| Dinheiro em Decimal | `toMoney(NaN)` e `toMoney(Infinity)` | **recusados** — sem zero silencioso |
| Ledger append-only (domínio) | procurar campo de mutação no modelo | **não existe `estornadoPorId`**; existe `estornoDeId`. Estorno é fato novo |
| Ledger append-only (banco) | `UPDATE` em `LancamentoContabil` pelo papel da aplicação | **NÃO recusado — lacuna aberta.** Ver abaixo |
| Idempotência de entrada externa | segundo insert com o mesmo `(fonte, chaveIdemp)` | **recusado** pela unique do banco; sobra 1 linha |
| Idempotência — escopo da chave | mesma chave em fontes diferentes | **aceito**, como deve ser: o escopo faz parte da chave |
| Idempotência de saída fiscal | segundo insert com o mesmo `(destino, chaveIdemp)` | **recusado** |
| Balanceamento por subsistema | lançamento que fecha no total e não fecha por subsistema | **recusado** |
| Partida dobrada | lançamento só com débito | **recusado** |
| Valor positivo | partida com valor zero | **recusado** |
| Guard de subsistema × PCASP | conta classe 1 rotulada `ORCAMENTARIO` | **recusado** |
| Guard de subsistema × PCASP | conta classe 5 rotulada `PATRIMONIAL` | **recusado** |
| Guard de subsistema × PCASP | conta classe 9 (fora de 1–8) | **recusado** |
| Guard de subsistema × PCASP | contas 7 e 8 como `CONTROLE` | **aceito** — o guard libera o certo, não só barra o errado |

### A lacuna do append-only — medida, não suposta

O append-only do ledger é garantido **pelo domínio**, não pelo banco.

Prova direta, executada em `gestao_publica_test`:

```
INSERT 0 1
UPDATE 1                       ← o UPDATE no ledger foi aceito
historico após UPDATE: DEPOIS-MUTADO
DELETE 1                       ← o DELETE também
```

Causa medida:

| Verificação | Resultado |
|---|---|
| `current_user` | `gestao` |
| `usesuper` | **`t` — é superusuário** |
| `tableowner` de `LancamentoContabil` | `gestao` — **a aplicação é dona da tabela** |
| `relrowsecurity` | `f` — sem política de linha |
| `GRANT`/`REVOKE`/`CREATE ROLE`/`ROW LEVEL SECURITY` nas 63 migrations | **zero ocorrências** |

Domínio protege quem passa por ele. Não protege de um script, de um console de
banco ou de um adapter futuro.

### ✅ FECHADA EM ENT01 — e o `it.fails` expirou sozinho, como prometido

`prisma/papel-runtime.ts` criou `gestao_app`: sem `SUPERUSER`, sem `BYPASSRLS`,
sem `CREATEDB`/`CREATEROLE`, sem `REPLICATION`, sem posse de tabela e **sem
`CREATE` no schema** — logo, sem DDL. `SELECT` e `INSERT` em tudo; `UPDATE` e
`DELETE` apenas num **censo de três tabelas**, levantado por varredura do código
de produção e assinado em código:

| Tabela | Permissão | Por quê |
|---|---|---|
| `Usuario` | `UPDATE ("ativo")` | ativar/desativar. Por COLUNA: `GRANT UPDATE` na tabela deixaria reescrever `identificador`, a identidade que aparece no `criadoPor` de todo fato do razão |
| `FichaOrcamentaria` | `UPDATE` nas 4 colunas de saldo | o cache recalculado por SUM |
| `VinculoUsuarioPerfil` | `DELETE` | revogar perfil |

A mesma sequência do ENT00, agora pelo papel da aplicação:

```
SELECT  → ok (a restrição não cegou a aplicação)
UPDATE  → ERROR: permission denied for table LancamentoContabil
DELETE  → ERROR: permission denied for table LancamentoContabil
CREATE TABLE → ERROR: permission denied for schema public
```

O `it.fails` de `test/invariantes-nucleo.test.ts` ficou **vermelho quando a
proteção chegou** — que era exatamente o que ele prometia fazer — e virou
asserção positiva, agora rodando pelo client do papel restrito. Rodá-la com o
dono continuaria falhando (o dono pode mutar as próprias tabelas, e é assim que a
fixture limpa o banco): seria a mesma lacuna, medida com o instrumento errado.

### O trinco pessimista teve de mudar de primitiva — e o achado é de fundo

`SELECT ... FOR UPDATE` **exige privilégio de UPDATE**, em todos os modos. Medido
contra o papel restrito:

```
SELECT id FROM "Liquidacao" LIMIT 1 FOR UPDATE;    → ERROR: permission denied
SELECT id FROM "Liquidacao" LIMIT 1 FOR SHARE;     → ERROR: permission denied
SELECT id FROM "Liquidacao" LIMIT 1 FOR KEY SHARE; → ERROR: permission denied
SELECT pg_advisory_xact_lock(42, 7);               → ok
```

E a aplicação **não pode** ter UPDATE em `Empenho`, `Liquidacao` ou `Contrato` —
são append-only, e é o que este lote acabou de fechar. A saída não foi afrouxar o
grant: foi usar a primitiva certa. `packages/locks` passou a
`pg_advisory_xact_lock`, que diz exatamente o que se quer ali — **exclusão
mútua** — e nada além; `FOR UPDATE` dizia "vou mudar esta linha", e ninguém vai.
Mesma vida (morre no commit), mesma detecção de deadlock, mesma ordem de
aquisição. E ela trava um id cuja linha ainda não existe, coisa que o `FOR
UPDATE` não fazia — passava batido.

## Migrações e SQL aplicados

| Migration ou arquivo | Efeito | Reversão prevista |
|---|---|---|
| 63 migrations de `prisma/migrations/` | Schema completo M01–M20 + adapters (herdadas de ENT00) | Nenhuma reescrita; evolução aditiva |
| 17 arquivos de `prisma/sql/` | Índices parciais e checks que o Prisma não representa | Reaplicáveis por `npm run db:sql` |
| `20260909175636_m19_pessoas_e_credores` | ENT01 — cadastro append-only de pessoas | Aditiva: três tabelas novas |
| `20260909175700_renomear_indice_certidao_fornecedor` | ENT01 — drift pré-existente, separado em migration própria para não viajar de carona | Aditiva |
| `20260909195419_m07_conta_passivo_da_consignacao` | ENT01 — `TipoConsignacao.contaPassivoId`, o que libera a retenção na tela | **Aditiva pura**: coluna nullable, sem backfill e sem default |
| `20260909213000_m05_ordem_de_pagamento` | ENT01/T07 — `OrdemDePagamento`, `MovimentoDaOrdemDePagamento` e `Pagamento.ordemDePagamentoId` | **Aditiva**: duas tabelas novas e uma coluna nullable com `@unique` |
| `20260909214500_m16_acoes_da_ordem_de_pagamento` | ENT01/T07 — três valores no enum `AcaoDoSistema` | **Aditiva**: `ADD VALUE` no enum |

**Nenhuma migration herdada foi apagada ou reescrita.** As cinco de ENT01 são
aditivas; a de `contaPassivoId` é nullable e sem default de propósito — um default carimbaria
toda consignação com um passivo inventado, e o razão passaria a acumular dívida com
o consignatário errado sem ninguém perceber.

`migrate deploy` sozinho **não** deixa o banco pronto: índice parcial ausente não
gera drift e não aparece no diff do Prisma. Os 17 arquivos foram aplicados nos
dois bancos.

## Pendências reais

| Pendência | Natureza | Bloqueia | Próxima ação | Responsável |
|---|---|---|---|---|
| ~~Ledger mutável pelo papel da aplicação~~ | Segurança / invariante 2 | — | ✅ **FECHADA em ENT01**: papel `gestao_app` sem superusuário, sem posse, sem DDL; `UPDATE`/`DELETE` só num censo de 3 tabelas. `FORCE ROW LEVEL SECURITY` **não** foi ligado: sem eixo de tenant, não há política de linha a escrever — ver "ENT01 — o que falta" | ENT01 |
| `test/` fora dos três alvos de typecheck | Qualidade | nada hoje | `tsconfig.backend.json` não inclui `test/` e `tsconfig.json` o exclui: erro de tipo em teste só aparece em runtime | a definir |
| 15 vulnerabilidades em dependências | Ambiente | nada hoje | **Não corrigidas de propósito**: `npm audit fix --force` troca versões e o lote exige preservar a instalação reproduzível. Tratar em commit separado com regressão completa | a definir |
| `PROJETO.md` defasado | Documentação | leitura futura | Ver divergência abaixo — **ainda não corrigido**; ENT01 acrescentou o M19 ao mapa, e a correção das linhas M09–M14 continua pendente | ENT01 |
| Nenhuma credencial ou convênio externo | Dependência de terceiro | validação externa de cada integração | Ver `docs/dependencias-externas.md` | a definir |
| ~~Referência de conformidade em código de tela~~ | Interface | — | ✅ **FECHADA em ENT01**: 85 ocorrências removidas de 21 arquivos; 15 frases reescritas em vocabulário de negócio. `test/ui/rotulos-de-conformidade.test.ts` impede a volta, e prova também que o vocabulário do negócio NÃO foi varrido junto. Uma exceção nomeada: as seções do **leiaute do TCE-PB** na tela do SAGRES (normativo externo, como "LRF art. 8º"), com a coluna rotulada para não ficar ambíguo | ENT01 |
| Código interno de módulo em texto de ajuda | Interface | nada hoje | 15 ocorrências de "M03", "M07", "M10" em texto de tela. Não é identificador de catálogo, mas não diz nada a quem usa. Registrado em `test/ui/rotulos-de-conformidade.test.ts` | lote que revisar tela a tela |
| Eixo **município** não existe no schema | Arquitetura | testes 4, 7 e 9 do incremento | `EnteConfig` é singleton por PK; o escopo de permissão é `ENTE \| UG`; nenhuma das 118 tabelas tem coluna de tenant. O próprio pacote registra que a escolha entre produto único e dois produtos "não dá para inferir do código". Ver `docs/caracterizacao-m01-m05.md` §6 | **decisão do usuário** |

### Divergência registrada, não corrigida

`PROJETO.md` (dentro do repositório) lista **M09, M10, M11, M12, M13 e M14 como
"pendente"**. O disco contradiz:

| Módulo | Arquivos `.ts` | Arquivos de teste |
|---|---:|---:|
| m09-tesouraria | 10 | 5 |
| m10-patrimonial | 17 | 7 |
| m11-licitacoes | 12 | 5 |
| m12-relatorios | 68 | 29 |
| m13-transparencia | 5 | 1 |
| m14-exports-federais | 8 | 2 |

O documento é que está defasado, não o código. Conferir o disco antes de tratar
qualquer módulo como ausente. **Não corrigido neste lote** — ENT00 proíbe alterar
código de domínio, e a correção do documento pertence ao lote que for usá-lo.

Ressalva que o mapa de lacunas já fazia e que se confirma: M09 tem 10 arquivos,
mas o handoff registra a tesouraria como "existe só como schema". Ter arquivo não
é ter capacidade — a caracterização de ENT03 dirá qual das duas leituras vale.

## Dependências externas

Espelho resumido de `docs/dependencias-externas.md` (criado neste lote).

| Órgão | Integração | Estado | Próxima ação |
|---|---|---|---|
| TCE/SC | Remessa e-Sfinge | **AUSENTE** | Obter IN TC-28/2021 e IN TC-35/2024 e o layout vigente |
| TCE/PB · TCM/BA | SAGRES · SIGA | Código local sem validação | Preservar como histórico; **não** converter em conector SC |
| ADN | NFS-e, IBS, CBS, NBS | AUSENTE + pendente de descoberta | Obter manual e XSD oficiais com vigência |
| TJ/SC | Peticionamento | AUSENTE + pendente de descoberta | **Não assumir PJe/MNI**; confirmar contrato antes de codificar |
| Provedor de HSM | Custódia A1 | **Provedor não definido** | Modo A1 indisponível com motivo declarado; não chamar de HSM um A1 cifrado no banco |
| Banco do Brasil | Borderô e retorno | Código local sem validação | Levantar os convênios que o município usa de fato |
| Demais 17 integrações | — | AUSENTE | Ver o documento |

**Credenciais obtidas: 0. Convênios firmados: 0. Transmissões reais: 0.**

## Situação do catálogo

| Cláusula | De | Para | Evidência |
|---|---|---|---|
| — | — | — | **nenhuma cláusula mudou de situação neste lote** |

ENT00 não entrega funcionalidade de produto. As 2.037 cláusulas de
`catalogo-execucao.json` permanecem `NAO_VERIFICADO`. Suíte verde mede o que a
base garante; não comprova atendimento de cláusula. Rodar 1288 testes que já
existiam não valida uma linha do documento de origem.

## ENT01 — o que foi feito, e é medido

| Frente | Estado | Evidência |
|---|---|---|
| Caracterização de M01 e M05 (§2.2) | ✅ | `docs/caracterizacao-m01-m05.md`; baseline dos dois módulos: 11 arquivos, 97 testes, 42,85 s |
| Papel de runtime (§3, 1º item) | ✅ | `prisma/papel-runtime.ts`, `npm run db:papel`, `test/papel-runtime.test.ts` (15 testes) |
| Append-only garantido pelo BANCO | ✅ | UPDATE/DELETE/TRUNCATE no razão recusados pelo papel da aplicação |
| A cadeia da despesa roda sob o papel restrito | ✅ | empenho → liquidação → pagamento com retenção, com os valores do cenário de aceite |
| T02 — pessoas e credores | ✅ | M19 (schema, domínio, ports, serviço, adapter, consultas) + tela + detalhe + histórico |
| T02 provado pela INTERFACE | ✅ | `npm run smoke:pessoas` — 9 passos em navegador real, 0 falhas |
| Nenhum identificador de catálogo em tela (teste 24) | ✅ | 85 removidos; `test/ui/rotulos-de-conformidade.test.ts` |
| T05 — detalhe do empenho | ✅ | `/despesa/empenhos/[id]`: origem, liquidações, retenções, pagamentos, anulações, razão e histórico no mesmo contexto. A consulta é do M05 (`dossie.ts`); a tela não soma nada |
| T06/T07 — retenção **pela tela** | ✅ | O form de pagamento oferece linhas de retenção; a conta de passivo vem do CADASTRO (`TipoConsignacao.contaPassivoId`), nunca do navegador |
| A cadeia atravessa pela INTERFACE | ✅ | `npm run smoke:cadeia` — empenhar, recarregar, liquidar, recarregar, pagar com retenção, conferir no dossiê, anular, recarregar. 17 passos, 0 falhas |
| Estorno não infla o caixa pelo bruto | ✅ | medido no razão: o estorno devolve **900,00** a Bancos e mata 100,00 de Consignações. Ver abaixo |

### O cenário de aceite, conferido perna a perna

Dotação 10.000,00 · empenho 1.000,00 · liquidação 1.000,00 · retenção **informada**
de 100,00 · saída de caixa 900,00. Valores de engenharia — não representam alíquota
legal, pagamento real nem tabela tributária de município algum.

Esperado, **registrado antes de rodar**, e conferido:

| Conta | Tipo | Subsistema | Valor |
|---|---|---|---|
| 2.1.3.1.1.00.00 (obrigação) | DÉBITO | PATRIMONIAL | 1.000,00 |
| 1.1.1.1.2.00.00 (caixa) | CRÉDITO | PATRIMONIAL | **900,00** |
| 2.1.8.8.1.01.00 (consignação) | CRÉDITO | PATRIMONIAL | 100,00 |
| 6.2.2.1.3.03.00 (crédito liquidado) | DÉBITO | ORÇAMENTÁRIO | 1.000,00 |
| 6.2.2.1.3.04.00 (crédito pago) | CRÉDITO | ORÇAMENTÁRIO | 1.000,00 |

Um lançamento com pernas de **valores diferentes**: o caixa leva o líquido, as
demais levam o bruto. Cada subsistema fecha sozinho — conferido, e não por
compensação entre eles.

#### E o ESTORNO, que é onde este cenário se paga

Anulado o pagamento **pela tela**, o razão recebeu (medido, `2026OP865626A`):

| Conta | Tipo | Subsistema | Valor |
|---|---|---|---|
| 2.1.3.1.1.00.00 (obrigação) | CRÉDITO | PATRIMONIAL | 1.000,00 |
| 1.1.1.1.2.00.00 (caixa) | DÉBITO | PATRIMONIAL | **900,00** |
| 2.1.8.8.1.01.00 (consignação) | DÉBITO | PATRIMONIAL | 100,00 |
| 6.2.2.1.3.04.00 (crédito pago) | DÉBITO | ORÇAMENTÁRIO | 1.000,00 |
| 6.2.2.1.3.03.00 (crédito liquidado) | CRÉDITO | ORÇAMENTÁRIO | 1.000,00 |
| 8.2.1.1.4.01.00 (DDR utilizada) | DÉBITO | CONTROLE | 1.000,00 |
| 8.2.1.1.3.01.00 (DDR por liquidação) | CRÉDITO | CONTROLE | 1.000,00 |

**O caixa recebe de volta 900,00 — o que saiu —, nunca os 1.000,00 do bruto.**
Um estorno pelo bruto inventaria 100,00 de disponibilidade que nunca saiu, e o
lançamento **fecharia do mesmo jeito**: os dois lados errados na mesma medida. É
por isso que nenhuma amarração de balancete pega esse erro, e é por isso que ele
tem teste e smoke próprios (`modules/m05-despesa/m05-dossie.test.ts`).

### O achado do funil de autorização — ação nova não alcança perfil existente

Descoberto pelo smoke, não por um teste. As três ações de T07 entraram no censo, e
o administrador da instalação recebeu:

```
ACESSO NEGADO: o usuário "admin@cg.pb.gov.br" não tem permissão para
PREPARAR_ORDEM_PAGAMENTO na unidade gestora ac-uo.
  perfis do usuário: ADMINISTRADOR
  o que faltou: A AÇÃO — nenhum dos perfis dele concede PREPARAR_ORDEM_PAGAMENTO,
  em unidade nenhuma. Não é escopo: é a ação.
```

**O funil estava certo.** O que faltava era o caminho de **atualização**: o
`bootstrap-usuario` monta o perfil de instalação a partir do censo **uma vez**, na
vida do banco. Uma versão que acrescenta ações deixa o administrador sem elas — e
ele descobre abrindo a tela nova.

O caminho existe agora: `npm run db:conceder <PERFIL> <ACAO>...`. Ele mora em
`scripts/`, **fora de `prisma/seed/`** — o t5 do M16 proíbe perfil, usuário e
permissão no seed, e a razão continua inteira ("um seed que carimba um
superusuário entrega a chave-mestra a quem rodar `npm run seed`"). E exige as
ações **por nome, uma a uma**: um `--todas` seria a chave-mestra com cara de
rotina. Não cria perfil; exige `SEED_IDENTIDADE`, porque conceder poder é um ato e
fica com o nome de quem o praticou.

⚠️ **Continua sem tela e sem caso de uso.** Conceder uma ação a um perfil não é
serviço do M16 — há `concederPerfil` (usuário → perfil), não `concederAcao`
(perfil → ação). Pendência `CONCEDER-ACAO-A-PERFIL-UI`.

### Afirmações do repositório que este lote encontrou FALSAS

Corrigir a documentação não é higiene: um comentário que descreve um sistema que já
não existe faz o próximo leitor **parar de ler o código**. As quatro:

| Onde | Dizia | É |
|---|---|---|
| `components/ui/MODULO-UI.md`, tabela de portas | escrita "não — ver §5" nas quatro portas de execução | O próprio §5, três parágrafos abaixo, dizia que elas escrevem desde a 7.3. Duas afirmações opostas no mesmo documento |
| `components/ui/MODULO-UI.md`, pendência `5.35-UI` | "anulação na tela — falta o ato na UI" | `FormAnular` existe e está em uso nas três listas da despesa **desde a cópia da origem**. A pendência estava quitada e ninguém apagou a linha |
| `lib/portas/pagamento.ts`, cabeçalho | "**SÓ LEITURA**" e "não há `pagar()` aqui" | `registrarPagamento` estava logo abaixo |
| `app/(areas)/despesa/pagamentos/page.tsx` | "SÓ LEITURA NESTA FATIA" | a tela paga |

E uma **lacuna** que só apareceu porque este lote precisou semear um banco de verdade:

> **`RoteiroOrcamentario` não tinha seed de produção.** A tabela-parâmetro é
> fail-closed por desenho — sem ela, o movimento de dotação não lança no razão e
> **nenhuma ficha nasce**. Os roteiros existiam só num helper de TESTE
> (`test/roteiro-orcamentario.ts`), então a suíte inteira passava enquanto um banco
> real não conseguia criar a primeira ficha. **A suíte não podia pegar isso: ela
> mesma semeava o que faltava.** Fechado em `prisma/seed/roteiro-orcamentario.ts`,
> importando os códigos de conta do domínio em vez de redigitá-los.

### Baselines de ENT01

| Medida | ENT00 (fim) | ENT01 (agora) |
|---|---|---|
| Arquivos de teste | 130 | **144** |
| Testes | 1.302 + 1 falha esperada | **1.441, zero falha esperada** |
| Duração | 312,17 s | **~340 s** (máquina livre) |
| `tsc` backend / app / scripts | limpos | limpos |
| Migrations | 63 | **68** |
| Smoke visual | 8 ok / 2 avisos | **22/22 rotas** |
| Smoke do cadastro de pessoas | — | **9/9 passos** (navegador real) |
| Smoke da cadeia da despesa | — | **23/23 passos** (navegador real) |
| Os 25 do incremento | — | **18 cobertos · 4 parciais · 3 não cobertos** |

⚠️ **Uma execução intermediária acusou 2 falhas, e elas foram investigadas, não
descartadas.** Uma era real (`listarPessoas` fora do censo do M16 — o grep-teste
bidirecional cobrando, que é o trabalho dele) e foi corrigida. A outra foi
**timeout de 5 s** no M14, com o servidor Next e o Chromium do smoke disputando a
máquina; reexecutada isoladamente e com a máquina livre, passou nas duas vezes.
Fica registrado porque "reexecutei e passou" só vale acompanhado do motivo.

## ENT01 — o GATE, item a item

O gate do prompt 01, §4, tem seis critérios. O que cada um exige e o que o
sustenta:

| # | Critério | Situação | Evidência (comando, nesta máquina) |
|---|---|---|---|
| 1 | A cadeia inteira executada **pela interface**, do cadastro do credor ao razão | ✅ | `npm run smoke:cadeia` — **23 passos, 0 falhas**, navegador real |
| 2 | Cada tela, recarregada, encontra o dado persistido | ✅ | o mesmo smoke recarrega depois de cada escrita; `npm run smoke:pessoas` — 9/9 |
| 3 | Os valores por conta e subsistema conferem com o esperado **registrado antes** | ✅ | `test/papel-runtime.test.ts`, `modules/m05-despesa/m05-dossie.test.ts` |
| 4 | O estorno inverte as pernas certas, preserva o original e não aumenta o caixa pelo bruto | ✅ | medido: caixa recebe **900,00** de volta. `m08-anulacao-rp`, `m05-dossie`, e o smoke |
| 5 | Os 25 testes do incremento passam, e a regressão de ENT00 continua verde | ⚠️ **parcial, e declarado** | **18 cobertos, 4 parciais, 3 não cobertos** — `test/incremento-25.test.ts` |
| 6 | `ESTADO-EXECUCAO.md` atualizado | ✅ | este documento |

### ⚠️ O critério 5, sem maquiagem

Três dos 25 **não estão cobertos**, e são o mesmo assunto:

| # | Cenário | Por que não |
|---|---|---|
| 4 | Município A não lê dados de B | O eixo município **não existe** nesta base |
| 5 | FK de outro tenant não é aceita | idem |
| 7 | Consolidação de A não inclui B | idem |

`EnteConfig` é singleton por chave primária e nenhuma das 118 tabelas tem coluna
de tenant. A decisão foi tomada e está em `docs/adr/ADR-eixo-de-municipio.md`
(**aceito**, 2026-09-09): o produto atenderá vários municípios por **schema por
município**, com plano de controle em `public` — não por `tenant_id`. É lote
transversal próprio, posterior a este.

**Estes três seguem declarados como pendência, nunca como atendidos.** Nenhum
município novo foi habilitado.

Quatro são **parciais**, com o que falta escrito:

| # | Cenário | O que existe | O que falta |
|---|---|---|---|
| 2 | Troca de entidade preservando o ano | a troca acontece sem novo login e o exercício segue na URL | quando o exercício não existe na entidade nova, declarar o motivo e exigir escolha explícita (`TROCA-DE-ENTIDADE-SEM-EXERCICIO`) |
| 9 | Job/anexo não vaza; memberships revogadas | revogar perfil e inativar usuário derrubam as sessões; o worker passa pelos mesmos guards | a metade dos **tenants** é o item 4 |
| 13 | Idempotência | chave repetida é **recusada** pelo banco, com payload igual ou divergente, e o primeiro fica intacto | repetir NÃO devolve o efeito anterior. Exige chave de idempotência **por requisição** (`IDEMPOTENCIA-DE-REQUISICAO`) |
| 20 | Relatório == tela | tela e PDF chamam a MESMA porta com os MESMOS filtros; os totais vêm do módulo | o teste que gere as duas saídas e as **confronte linha a linha** (`RELATORIO-VS-TELA-CONFRONTADOS`) |

## ENT01 — o que ficou de pé nesta segunda parte

| Frente | Estado | O que é |
|---|---|---|
| **T05 detalhe do empenho** | ✅ | `/despesa/empenhos/[id]` — origem, liquidações, retenções, pagamentos, anulações, razão e histórico no mesmo contexto |
| **T06 retenção pela tela** | ✅ | o form de pagamento pergunta o valor retido; a **conta de passivo é do cadastro**, conferida dentro da transação |
| **T07 pagamento em quatro etapas** | ✅ (etapa 3 declarada indisponível) | ordem de pagamento com preparar/autorizar **segregados**, registro, envio ao banco **indisponível com motivo**, confirmação lida do M09 |
| **T08 razão e conferência** | ✅ | totalizadores por subsistema **com a diferença**, filtros de fato/fonte/unidade, seleção múltipla com soma, coluna de estorno |
| Os três testes difíceis | ✅ | pool (8), unidade de trabalho (14), período fechado por três rotas (11) |
| Seed de produção puro | ✅ | `test/seed-de-producao.test.ts` — banco vazio, seeds de produção, primeira escrita de cada módulo |

### As duas consequências do ADR que valeram já

Nenhuma das duas implanta multi-tenancy. Elas param de **dificultá-la**:

- **`EnteConfig` atrás de uma função** (`modules/m01-core-contabil/contexto-do-ente.ts`).
  A chave do singleton estava escrita à mão em quatro lugares.
- **O schema virou parâmetro** nos grants do `gestao_app`. E não eram só as três
  linhas óbvias: os `GRANT ... ON TABLE` do censo eram **não qualificados**, e
  resolviam pelo `search_path` do dono — com um schema por município, um
  `search_path` diferente concederia privilégio na tabela do município errado, em
  silêncio, porque o SQL é válido.

## ENT01 — o que FALTA (e não bloqueia o gate)

| Frente | Estado | O que falta |
|---|---|---|
| T01 entrada e contexto | parcial | ver o item 2 do incremento |
| T03 dotações e fontes | existe | declarar na tela quais saldos são **atuais** e quais são em data — a caracterização mostrou que só há o atual |
| T04 empenhos | existe | oferecer o cadastro de credor como sugestão (`CREDOR-NO-EMPENHO`) |
| T09 integrações | existe | confrontar com registros reais de tentativa |
| Envio ao banco (T07, etapa 3) | **não existe** | o M17 é só leitura. A porta declara indisponível com motivo, e o tipo de retorno **impede escrever o caminho feliz** (`ENVIO-AO-BANCO-M17B`) |
| Cadastro de tipos de consignação | não existe | a conta de passivo se parametriza por seed; a tela mostra o tipo sem conta DESABILITADO com o motivo (`CONTA-PASSIVO-CONSIGNACAO-UI`) |
| Conceder ação a perfil | não existe | ação nova no censo não alcança perfil existente. Hoje: `npm run db:conceder` (`CONCEDER-ACAO-A-PERFIL-UI`) |

## Próximo lote

| Campo | Valor |
|---|---|
| Lote encerrado | `prompts/01-CONTEXTO-E-PRIMEIRA-ENTREGA.md` com `especificacoes/PRIMEIRA-ENTREGA.md` — **no gate, aguardando revisão**. ENT02 NÃO foi iniciado |
| Decisão tomada | **O eixo município: schema por município**, com plano de controle em `public`. `docs/adr/ADR-eixo-de-municipio.md`, estado **aceito**, 2026-09-09. Duas das cinco consequências foram executadas dentro deste lote (o `EnteConfig` atrás de função e o schema como parâmetro nos grants); as outras três são o lote transversal |
| Riscos conhecidos | (1) O trinco pessimista mudou de primitiva em ENT01 — a regressão está verde, mas concorrência se paga tarde: os testes do M05 sob concorrência continuam sendo a rede, e `packages/locks/locks.test.ts` agora cobra que ninguém trave por fora. (2) O valor retido é **informado**, nunca calculado — ver o adiamento declarado abaixo. (3) Todos os tipos de consignação apontam para a MESMA conta de passivo, porque o plano mínimo tem uma só analítica; o saldo por consignatário continua sendo por `(tipo, credor)`, nunca pela conta contábil. (4) A etapa de envio ao banco não existe, e a tela diz isso — o risco é alguém ler "pagamento registrado" como "dinheiro transferido" |

## ⚠️ Adiamentos DELIBERADOS, com destino

Um adiamento sem destino vira lacuna que ninguém reabre. Estes têm.

### O cálculo da retenção na fonte

**Hoje:** o valor retido é **informado pelo operador**. A tela diz isso, com todas
as letras, no bloco de retenção.

**Por que não é decisão de produto, e sim adiamento:** alíquota de INSS, IRRF ou
ISS depende de legislação tributária — regime do prestador, base de cálculo,
retenção mínima, o município de incidência do ISS. Este sistema não conhece nada
disso. Um cálculo automático hoje seria **recolhimento a menor com o ente
respondendo pela diferença**, e o erro apareceria numa fiscalização, não num
teste.

**Quando entra, e com o quê:** com o bloco fazendário. E não como uma constante:
regra **versionada por vigência** (a alíquota de 2026 não recalcula uma retenção
de 2025) e **memória de cálculo** persistida junto da retenção — base, alíquota,
versão da regra —, porque quem confere precisa ver a conta, não o resultado.

O incremento já previa exatamente isto: *"se houver cálculo de alíquota/base,
apresentar a regra versionada e memória; para a fixture inicial usar um valor
explicitamente informado, sem inventar uma alíquota legal"*.

**O que o sistema garante enquanto isso:** que o lançamento feche, que o passivo
nasça na conta do **cadastro** (não numa escolhida por quem chamou) e que o caixa
saia pelo líquido.

### O envio ao banco

**Hoje:** indisponível, com motivo declarado, sem rota e sem botão. O tipo de
retorno da porta é `disponivel: false` **literal** — enquanto não houver o que
ligar, nenhum código consegue escrever o caminho feliz; o compilador recusa.

**Quando entra:** com o M17-b (escrita bancária). O M17 atual é só leitura —
extrato e saldo.

**O que não pode acontecer nesse meio-tempo:** um botão "enviar" que devolva
sucesso local. É a diferença entre "o pagamento foi registrado" e "o dinheiro
saiu", e um sistema que as confunde produz o pior tipo de erro: o que parece
resolvido.

---

# ENT02 — capacidades transversais exercitadas por documentos reais

> Executado em 2026-09-10, nesta máquina, sobre o ENT01 no gate.
> Sete módulos novos, todos os números medidos.

## 1. O gate, item a item (seção 6 do prompt do lote)

| # | Definição de concluído | Situação | Prova |
|---|---|---|---|
| 1 | Um processo digital percorre abertura, tramitação, parecer, readequação, encerramento e arquivamento, **pela interface**, com dados persistidos e visíveis após recarga | ✅ | `scripts/smoke-ent02.ts` — **43 passos, 0 falhas**. Cada passo **recarrega a tela do servidor** antes de conferir |
| 2 | Um comunicado percorre inclusão, resposta, encaminhamento, leitura registrada e arquivamento | ✅ | mesmo smoke, passos 22-28 |
| 3 | Um cadastro de pessoa recebe campo adicional, anexo e assinatura, e exibe a linha do tempo no detalhe | ⚠️ **PARCIAL** (era 0 de 3 na tela de pessoa, agora é 1 de 3) | **anexo: entregue** no fechamento — a tela da pessoa tem `input[type=file]`, lista com download individual e lote. **Campo adicional e assinatura em PESSOA continuam sem superfície**: o motor existe e é testado, a tela não. Pendências `CAMPO-ADICIONAL-DEFINICAO-UI` e `ASSINATURA-UI` |
| 4 | Um relatório operacional é produzido **pelo designer**, com modelo copiado, visibilidade definida e execução em segundo plano | ✅ | smoke, passos 29-36: cria o modelo, recusa a expressão maliciosa, copia (a cópia nasce restrita), executa e abre o CSV com o campo calculado |
| 5 | Toda a suíte existente continua verde e os testes deste lote passam | ✅ | **157 arquivos, 1580 testes, 0 falhas** (334s). No gate eram 153/1556 em 403s — o fechamento acrescentou 4 arquivos e 24 testes, e o tempo caiu porque a suíte deixou de disputar o banco |
| 6 | `ESTADO-EXECUCAO.md` registra código, gate, comandos, resultados reais e o próximo lote | ✅ | este documento |

### O critério 3, dito sem maquiagem

O prompt pede o trio **campo adicional + anexo + assinatura** no cadastro de **pessoa**.
O que existe:

- **campo adicional**: o motor é genérico (`CadastroComCamposAdicionais` inclui `PESSOA`)
  e testado; a tela de preenchimento existe para **processo**, não para pessoa;
- **anexo**: **resolvido no fechamento**. `Anexo.pessoaId` já existia com autorização por
  registro; agora existem o `input[type=file]`, a rota de download individual
  (`/documentos/anexos/[id]`) e a de lote, as duas autorizadas pelo registro dono;
- **assinatura**: existe e é testada sobre anexo e sobre movimento — não há tela.

Nada disso foi contornado com um substituto que pareça pronto. As pendências que restam
estão nomeadas em `components/ui/MODULO-UI.md`.

## 2. Os 22 testes mínimos do lote (seção 5)

**21 cobertos · 0 parciais · 1 não coberto.** (Era 20/1/1 no gate; o item 4 fechou no
fechamento — ver a seção 10.) O inventário é `test/lote-ent02.test.ts`,
que imprime o placar a cada execução e falha se a classificação mudar sem alguém decidir.

| # | Item | Situação |
|---|---|---|
| 1 | Processo do município A não visível em B | **NÃO COBERTO** — é o eixo município, decidido pelo ADR e fora deste lote. Segue declarado, como no ENT01 |
| 4 | Anexo não acessível **por URL** a quem não tem permissão | **PARCIAL** — a regra está provada (quem não é envolvido recebe `null`) e o arquivo mora fora de pasta servida estaticamente; falta a URL, porque não há rota HTTP de download |
| demais 20 | — | cobertos, cada um com o arquivo e o teste apontados no inventário |

## 3. Os sete módulos, e a decisão central de cada um

| Módulo | Bloco | A decisão que governa |
|---|---|---|
| **M21** protocolo | 5.42 (75 cláusulas, era `AUSENTE_CONFIRMADO`) | **não existe coluna `situacao`** — ela é derivada dos movimentos, como o `statusDoEmpenho` sai dos SUMs |
| **M22** anexos e assinatura | 2.4/2.5 do prompt | a autorização do anexo é a do **registro dono**; nenhuma regra de acesso nova |
| **M23** comunicação interna | 5.43 (53 cláusulas, era `AUSENTE_CONFIRMADO`) | **as caixas são ponto de vista, não estado** — o mesmo documento está na saída de um e na entrada do outro |
| **M24** notificações | 2.6 | um serviço, três canais, **e só um existe** — e-mail e push ficam registrados com `entregueEm` nulo e motivo |
| **M25** campos adicionais | 5.29.7 | **quatro colunas tipadas**, não um `valor String`: comparar "1.000" com "900" como texto diria que 900 é maior |
| **M26** designer | 2.7 | a linguagem é **pequena por construção** — o que ela não sabe fazer, ela não faz, e não porque alguém a proibiu |
| **M27** suporte | 2.8 | severidade é **dado de configuração**, não enum: é o que cada contratante negocia no contrato |

## 4. O que o ENT02 acrescentou, em números medidos

| Medida | ENT01 (gate) | ENT02 (gate) | ENT02 (fechamento) |
|---|---:|---:|---:|
| Arquivos de teste | 144 | 153 | **157** |
| Testes | 1441 | 1556 | **1580** |
| Serviços no censo | 105 | 156 | 156 |
| Ações distintas | 101 | 149 | 149 |
| Migrations | 68 | 80 | 80 |
| Rotas no smoke visual | 22 | **29** | 29 |
| Passos de smoke de cadeia | 23 (despesa) | 23 + 37 (ENT02) | 23 + **43** (ENT02) |
| Passos do smoke de pessoas | 9 | 6 ok / **3 falhas** | **9 ok / 0 falhas**, três execuções seguidas |

⚠️ **Nem serviço nem ação nova no fechamento, e isso é deliberado.** Os quatro itens são
superfície, teste e infraestrutura — o download de anexo é LEITURA, e leitura não vira ação
do censo porque a permissão que a governa é a do registro dono. Uma ação `BAIXAR_ANEXO`
seria uma segunda regra de acesso, que divergiria da primeira. As cinco leituras novas
entraram em `FORA_DO_CENSO` com o motivo.

## 5. Os comandos, e o que cada um respondeu

| Comando | Resultado real | Quando |
|---|---|---|
| `npx vitest run` (gate) | **153 arquivos, 1556 testes, 0 falhas** — 403s | 2026-09-10 |
| `npx vitest run` (fechamento) | **157 arquivos, 1580 testes, 0 falhas** — 334s | 2026-09-10 |
| `npx tsx scripts/smoke-ent02.ts` (fechamento) | **43 passos, 0 falhas** | 2026-09-10 |
| `npm run smoke:pessoas` ×3 seguidas (fechamento) | **9/9 cada**, 0 falhas | 2026-09-10 |
| `npm run typecheck` · `typecheck:app` · `typecheck:scripts` | limpos | 2026-09-10 |
| `npm run build` | compila; 7 rotas novas | 2026-09-10 |
| `npm run db:papel` | papel sem superusuário, sem BYPASSRLS, sem DDL, nos dois bancos | 2026-09-10 |
| `SEED_IDENTIDADE=… npm run seed:ent02` | cenário semeado: 3 setores, 3 assuntos com roteiro, 3 tipos de comunicado, 3 severidades, 5 campos adicionais, 2 ajudas | 2026-09-10 |
| `npx tsx scripts/smoke-ent02.ts` | **37 passos, 0 falhas** | 2026-09-10 |
| `npx tsx scripts/smoke-cadeia-despesa.ts` | **23 passos, 0 falhas** — o ENT01 continua atravessando | 2026-09-10 |
| `npx tsx scripts/smoke-visual.ts` | **29/29 rotas** | 2026-09-10 |
| `npx tsx scripts/smoke-cadastro-pessoas.ts` | **6 ok, 3 falhas** — ver abaixo | 2026-09-10 |

### ⚠️ As 3 falhas do smoke de pessoas são resíduo, e o motivo vai junto

O cadastro de teste `11222333000181` ("Fornecedor de Smoke ME") **ficou no banco de
desenvolvimento** numa execução anterior, em **2026-09-09 22:04:47**. As três falhas são
o smoke colidindo com o próprio resíduo — ele mesmo avisa isso na saída ("o cadastro de
teste pode ter ficado no banco de dev"). Os passos que não dependem de criar (detalhe,
concessão de papel, histórico, recusa de duplicado) passam.

**Não removi o registro**: é dado do banco de desenvolvimento, criado fora desta sessão,
e apagá-lo é decisão de quem opera o ambiente — não de quem está no meio de um lote.

## 6. ⚠️ O falso alarme que quase virou conclusão errada

Uma regressão intermediária deu **13 falhas em M05, M08, M12, M19 e M20** e levou
**107 minutos** (o normal é ~7). Nenhum desses módulos tinha sido tocado.

**Não era o código.** Eram **duas execuções da suíte disputando o mesmo banco de teste**,
porque lancei um subconjunto enquanto a completa ainda rodava. Com o banco quieto, os
mesmos arquivos passam em 12 segundos.

O que sobrou de real da investigação foi outra coisa, e ela valeu: `TRUNCATE` de 141
tabelas **vazias** custava **1794 ms** — o custo é tomar `ACCESS EXCLUSIVE` e recriar o
arquivo de cada tabela e índice, não as linhas. Passou a truncar só o que tem linha
(detecção por `EXISTS`, que lê linha e não estatística): **21 ms**.

> ⚠️ E uma armadilha do driver ficou escrita no código: com o delimitador `$$`, o bloco
> `DO` é **aceito, não levanta erro e não executa**. A falha aparece longe, no arquivo
> seguinte, como violação de unicidade. O delimitador é nomeado (`$limpeza$`).

## 7. ⚠️ O outro falso alarme: o Chromium sob pressão de memória

Os smokes falhavam com `Runtime.callFunctionOn timed out` — que se lê como *"a tela não
respondeu"* e mandaria a próxima pessoa procurar defeito na tela.

Medido: **84 MB de memória física livre e 6,6 GB dos 8 GB de swap em uso**. O renderer
estava sendo paginado para o disco. Os quatro smokes ganharam
`--disable-dev-shm-usage`, `--disable-gpu`, `--disable-extensions` e `protocolTimeout`
explícito — e passaram a rodar.

## 8. O que o smoke pegou, e que nenhum teste de módulo pegaria

| Achado | Onde |
|---|---|
| A tela preenchia os campos do **parecer** e apertava o botão do **trâmite** — `querySelector` devolve o primeiro da página | corrigido na TELA: cada `<form>` ganhou `data-acao` |
| O seletor de **encaminhamento** oferecia um setor que o servidor recusa ("o setor já está no comunicado") | a tela passou a excluir também quem já está na conversa |
| A porta do comunicado não publicava o **modo de assinatura exigido** — tornava impossível enviar um ofício que a entidade configurou para exigir assinatura | publicado |
| A linha do tempo não publicava `respondeAId` — o seletor de "responder parecer" ofereceria pedidos já respondidos | publicado |

## 9. Adiamentos DELIBERADOS, com destino

| O que | Por que agora não | Destino |
|---|---|---|
| **Eixo município** (teste 1) | Decisão do ADR: schema por município é lote transversal próprio | lote de tenancy |
| **Fluxograma visual do processo** | O próprio prompt manda não implementá-lo agora | lote posterior identificado |
| **Guia bancária da taxa** | Pertence ao bloco de arrecadação (5.29), `AUSENTE_CONFIRMADO`, frente ENT06 | `PROTOCOLO-GUIA-BANCARIA` |
| **Assinatura qualificada / HSM** | Sem provedor. O caso de uso RECUSA produzi-la | `ASSINATURA-ICP-HSM` |
| **Envio real de e-mail e push** | Sem provedor, e envio externo está fora da autorização de trabalho | `NOTIFICACAO-EMAIL-PUSH` |
| **Trabalhador contínuo do designer** | Sem agendador. Hoje a fila é drenada ao abrir a tela, e isso está declarado | `DESIGNER-WORKER-CONTINUO` |
| **Telas de cadastro** (setor, assunto, tipo de comunicado, severidade, definição de campo) | Os casos de uso existem e são exercitados pelo seed do cenário | 5 pendências em `MODULO-UI.md` |

## 10. O fechamento do ENT02 — os quatro itens da revisão

> Executado em 2026-09-10, à tarde. Quatro commits separados, suíte verde antes e depois
> de cada um. A ordem de execução não foi a de numeração: a trava da suíte (item 3) veio
> primeiro porque é a infraestrutura que permite medir os outros três com confiança.

| Item | Commit | Suíte depois |
|---|---|---|
| 3. Trava de concorrência da suíte | `f68e760` | 155 arquivos · 1560 testes · 383s |
| 1. Superfície dos anexos | `42acb00` | 156 · 1574 · 363s |
| 2. Smoke de pessoas idempotente | `5eb33b2` | 156 · 1574 · 349s |
| 4. Formulários na mesma página | `68108ff` | 157 · 1580 · 334s |

### 11.1 O escopo dos anexos era GLOBAL, e foi medido antes de escrever

A revisão perguntou se a rota de download faltava só na tela de pessoa ou no produto
inteiro. Medido, e é o pior caso:

- `lib/portas/` não tinha porta de documentos;
- `anexarArquivo` e `baixarAnexo` eram chamados **só pelo próprio arquivo de teste**;
- o único `input[type=file]` do produto era o do importador de CSV;
- não havia rota de download em lugar nenhum.

O M22 fechou o ENT02 com caso de uso, autorização por registro, hash, conferência de
integridade e quinze testes — **e zero consumidores**. Um cofre sem porta. Pior: a tela do
processo já LISTAVA o nome dos anexos de cada movimento, sem link — a forma mais silenciosa
de prometer sem entregar.

**Três decisões da superfície.** A saída é rota HTTP e não Server Action (um PDF de 20 MB
atravessaria o protocolo do React como array de bytes e o browser não saberia salvá-lo). A
porta usa `sessaoAtual` e não `exigirSessao` — este REDIRECIONA para `/login`, e um browser
que seguisse o 307 salvaria o HTML do login com o nome do PDF; sem sessão a rota responde
**404**, a mesma resposta de "não existe", porque um 401 confirmaria que o anexo existe.
E `attachment` + `nosniff`: `inline` faria o browser renderizar o arquivo na origem da
aplicação, e um "anexo" HTML enviado por requerente externo viraria script com o cookie de
quem o abriu.

**Enumerar já é vazar.** A lista também pergunta ao registro dono: os nomes dos arquivos de
um processo disciplinar contam a história inteira sem que ninguém baixe nada.

**O lote não é atalho para fora da autorização.** Ele monta o zip com o que `baixarAnexo`
entregaria um a um, e confere o hash de cada arquivo — um adulterado derruba o lote inteiro.
Se ele engolisse, o download individual recusaria e o lote entregaria: duas respostas para a
mesma pergunta, e a mais permissiva ganharia.

O contêiner ZIP saiu do M14 para `packages/zip` em vez de virar um segundo formatador do
mesmo formato binário. O teste do M14 compara **byte a byte** e exige duas execuções
idênticas — é ele que prova que o artefato fiscal não mudou de forma.

### 11.2 Dois defeitos que os testes acharam, e os dois eram meus

**O diretório central do zip escrevia offset 0 em toda entrada.** Constante correta para um
arquivo, errada para três: o extrator mostraria o primeiro documento três vezes, com três
nomes diferentes, sem estourar nada. Pego porque o teste chama o `unzip` **do sistema
operacional** — um programa que este repositório não escreveu e não pode enganar. Conferir
os bytes contra a minha própria leitura dos bytes provaria só que sei ler o que escrevi.

**`nomeSeguroNoZip` removia os pontos iniciais antes de achatar as barras**, e
`../../.ssh/authorized_keys` saía com um `..` vivo no meio. O teste só pegou porque compara
o nome inteiro; um `not.toContain("/")` teria passado.

E um terceiro, no smoke: a requisição anônima saía de `about:blank` e falhava por CORS, não
por autorização. O smoke acusava "a requisição anônima nem completou" — **um servidor que
entregasse o anexo a qualquer um teria dado exatamente a mesma falha**. Um teste de
segurança que passa a errar do lado seguro é o mais perigoso que existe.

### 11.3 Por que documento pré-existente derrubava o smoke de pessoas

A regra de deduplicação está certa e é testada — o próprio passo 7 do smoke prova que a tela
mostra a recusa do domínio. O caminho tratado era o do domínio; o que ninguém tratou foi o
smoke: o passo 2 assumia banco limpo.

**E o comentário no topo do arquivo era falso de duas maneiras.** Dizia que documento único
por execução "não é possível — o DV depende dos dígitos do meio", confundindo "não posso
trocar dígitos mantendo um DV fixo" com "não posso gerar um CNPJ válido aleatório" — o DV se
calcula a partir dos dígitos sorteados. E dizia que "o smoke LIMPA o próprio rastro no fim":
**não havia teardown nenhum**. O comentário descrevia comportamento que o arquivo não tinha.

Escolhido **gerar** em vez de limpar: teardown resolve o caso feliz e falha quando importa —
se o processo morre no meio, o rastro fica e a execução seguinte herda o problema, que é
exatamente o que aconteceu. E apagar exigiria dar ao smoke poder de DELETE sobre um cadastro
append-only, que o M19 não tem de propósito.

Medido: **três execuções consecutivas contra o mesmo banco de dev, 9 ok / 0 falhas cada**
(antes: 6 ok / 3 falhas da segunda em diante).

De caminho, dois outros achados no mesmo arquivo: o passo 4 abria o **primeiro** link da
lista (num banco com outras pessoas, o detalhe de outra — e falharia dizendo "o detalhe não
traz o nome": sintoma verdadeiro, causa errada); e o arquivo nunca importou `dotenv`, então
a única forma de rodá-lo era digitar a senha como argumento, que fica no histórico do shell.

### 11.4 A trava da suíte

`pg_advisory_lock` de sessão, tomado no `global-setup` **antes** de migrar, aplicar SQL ou
provisionar o papel. O segundo processo recebe o pid, o `application_name` de quem segura, o
endereço do banco, o que fazer, e o registro do episódio que motivou a trava.

Advisory lock e não arquivo de trinco: o recurso disputado é o **banco**, não a máquina — um
arquivo em `/tmp` não veria outro checkout apontando para o mesmo banco e barraria duas
suítes que usam bancos diferentes. E ele morre com a conexão, inclusive sob `kill -9`;
arquivo de trinco sobrevive e deixa a suíte travada até alguém apagá-lo à mão.

Ele **falha em vez de esperar**. O caso real não é duas pessoas rodando ao mesmo tempo: é a
mesma pessoa esquecendo a suíte completa noutra janela. Ela precisa saber disso, não aguardar
107 minutos por um resultado que chegaria contaminado.

O teste é auto-verificável: quando ele roda, o trinco já está tomado pelo próprio
`global-setup`, então pedi-lo dali **é** a concorrência que se quer provar. Se alguém remover
a trava, `travarASuite` sucede e o teste falha.

Medido: com o trinco preso, exit 1 e a mensagem nomeando o processo 19037.

### 11.5 Os catorze formulários — a resposta direta

**Os ids não estavam repetidos, e não foi preciso torná-los únicos nem renderizar um por
vez.** `CampoEnvolvido` já montava o id com `useId()`, único por instância — então `label
for`, leitor de tela e navegação por teclado sempre funcionaram. O que estava errado era o
**smoke**, que localizava campos com `querySelector` global.

Mas "eu li o código e ele usa `useId`" é o tipo de afirmação que envelhece. Agora há prova:
seis testes que exigem zero ids repetidos com `name` repetidos, que todo `label for` e todo
`aria-describedby` apontem para dentro do **próprio** formulário (um id único apontando para
o campo do form vizinho passaria num teste de unicidade e ainda mandaria o foco para o lugar
errado), que todo `<form>` tenha `data-acao` único, e que o `FormData` de cada um leve só os
seus campos.

O sexto alcança as **telas**, não o componente — e **achou um caso real que a leitura não
pegou**: o `<datalist>` de naturezas da arrecadação usava `id="naturezas-loa"` fixo. Hoje a
tela o renderiza uma vez e funciona; no dia em que renderizar dois, o `list` do segundo input
apontaria para as sugestões do primeiro, em silêncio. Corrigido com `useId` em vez de aberto
como exceção.

## 11. ENT03 — a caracterização, a tesouraria, e o que NÃO foi feito

> Executado em 2026-09-10. **Parado no gate, aguardando revisão.**

### 12.1 A ordem foi respeitada: caracterizar antes de ampliar

**Nada novo entrou em M01, M04, M05, M06, M07, M08, M12 ou M14 antes da medição.** E a
medição encerrou a dúvida de 09/09:

```
$ npx vitest run modules/m01-core-contabil modules/m04-receita modules/m05-despesa \
    modules/m06-ordem-cronologica modules/m07-extraorcamentario \
    modules/m08-restos-a-pagar modules/m12-relatorios modules/m14-exports-federais

 Test Files  61 passed (61)
      Tests  647 passed (647)
   Duration  190.52s
```

**Nenhuma das 13 falhas de 09/09 era defeito.** Eram duas suítes disputando o banco.

`docs/caracterizacao/01-financeiro.md` registra os cinco comportamentos, e
`test/caracterizacao/financeiro.test.ts` (15 testes) os prende: **três deles registram
LIMITAÇÃO, não garantia** — se alguém as corrigir, o teste falha, e a correção vira decisão
consciente.

**O achado que muda o plano:** ⚠️ **não existe saldo de dotação por data.**
`saldosDaFicha` tem dois parâmetros e nenhum é temporal, e `MovimentoDotacao` **não tem
data de competência** — só `criadoEm`, o instante da gravação. Um decreto de 20/06 lançado
em 15/07 responderia errado a "qual era o saldo em 30/06?", **em silêncio**. E o empenho
TEM `data`, o que torna a assimetria uma armadilha.

Cotas por período, contingenciamento e prévia de alteração (2.5) dependem disso. **Nenhum
deles foi construído**, e é por essa razão.

### 12.2 A máquina — decidido e registrado ANTES de abrir o lote

`docs/caracterizacao/00-maquina-e-concorrencia.md`. Medido: 8 GB de RAM, Docker com
3,825 GiB reservados, **7,4 GB dos 8 GB de swap em uso em repouso**. Durante a suíte sobram
29–232 MB; durante o smoke o swap chega a **7857 MB de 8192 (96%)**.

Cada um passa sozinho; os dois juntos não passam. `scripts/trinco-de-maquina.ts` serializa
suíte, smokes e build. Ele **não substitui** a trava do ENT02: aquela protege o banco e é
por banco; esta protege a máquina.

**Recusado:** limitar a concorrência da suíte. O RSS somado dos processos node no pico foi
**538 MB** — ela não é a maior consumidora. Cortar workers a deixaria mais lenta sem
devolver memória.

⚠️ **Nada foi parado nem reconfigurado no Docker.** Os três containers de outro projeto e o
limite da VM são ambiente do usuário. Fica o número.

### 12.3 O que a tesouraria ganhou

Lote de pagamento, borderô e retorno bancário — os **testes 4, 5 e 6** do lote do ENT03,
com 18 testes novos. O detalhe está em `modules/m09-tesouraria/MODULO.md`.

Três decisões que valem repetir aqui:

- **o lote AGRUPA** `OrdemDePagamento` e `MovimentoExtraorcamentario` que já existiam — não
  copia valor, credor nem conta, e quem paga continua sendo o M05;
- **a ordem cronológica é conferida na inclusão**, contra a mesma fila do M06 — porque a
  caracterização mostrou que o domínio **relata** e não bloqueia;
- **o borderô vira um `Anexo` de origem SISTEMA**, então é baixável pela rota do ENT02 e
  assinável pela fila do M22, sem código novo.

⚠️ **E o guard da ordem cronológica nasceu errado.** Sem descontar da fila os itens já em
lote vigente, um lote com duas liquidações da mesma fonte era **impossível de compor**. Só
apareceu porque o teste tinha duas liquidações — com uma só, ele passaria por vacuidade.

### 12.4 ⚠️ O que NÃO foi feito — a maior parte do prompt

| Seção do prompt | Situação |
|---|---|
| 2.2 movimentação bancária por fonte | **não feito** — `TESOURARIA-MOVIMENTACAO` |
| 2.2 conciliação: cópia de pendências ao período seguinte | **não feito** — `CONCILIACAO-COPIA-PENDENCIAS` |
| 2.3 diárias, adiantamentos, prestação de contas online | **não iniciado** |
| 2.4 convênios, precatórios, dívida fundada, PPP, consórcios, obras, multas | **não iniciado** |
| 2.5 planejamento (audiências, emendas, prévia, cotas, contingenciamento…) | **não iniciado** — e 2.5 depende do achado 12.1 |
| 2.6 controle interno (módulo novo) | **não iniciado** |
| 2.7 assinatura no fluxo financeiro | **parcial**: o borderô entra na fila; empenho, liquidação, ordem e comprovante **não** |
| 2.8 consulta externa do fornecedor | **não iniciado** |
| Telas do lote e do borderô | **não feitas** — `LOTE-UI`. Os casos de uso existem e são testados |

Dos **22 testes mínimos** do lote, **3 estão cobertos** (4, 5 e 6). Os outros 19 não.

A definição de concluído (seção 5 do prompt) **não está atendida**: nenhum dos quatro
percursos pela interface existe.

### 12.5 O catálogo — a medida real de quanto falta

`scripts/marcar-catalogo.ts` marca `situacao` e `evidencia` só onde há **comportamento,
teste e evidência** — que é o aviso do próprio catálogo. Ele **recusa** marcação sem
evidência e falha se um id não existir.

| Situação | Cláusulas |
|---|---:|
| `NAO_VERIFICADO` | 1999 (98,1%) |
| `VALIDADO_LOCALMENTE` | 21 |
| `IMPLEMENTADO_NAO_VALIDADO` | 10 |
| `AUSENTE_CONFIRMADO` | 4 |
| `DEPENDENCIA_EXTERNA` | 2 |
| `PARCIAL` | 1 |

**38 de 2037 cláusulas verificadas — 1,9%.** O número é desconfortável e é o ponto: sem
ele, "ENT01 e ENT02 concluídos" soaria como muito mais do que é. As 1999 restantes não
foram olhadas, e ninguém deve supor nada sobre elas.

⚠️ **O catálogo vive em `gestao-publica-execucao/`, que NÃO é repositório git.** A alteração
não é revertível por `git checkout`. O script é idempotente e o estado anterior era
`NAO_VERIFICADO` com evidência vazia em todas as 2037 — reconstruível, mas registro aqui
porque a irreversibilidade é real.

### 12.6 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| suíte dos 8 módulos | **61 arquivos, 647 testes, 0 falhas** — 190s | 2026-09-10 |
| `npm run test:tudo` | **159 arquivos, 1613 testes, 0 falhas** — 334s | 2026-09-10 |
| 3 typechecks | limpos | 2026-09-10 |
| `npx prisma migrate deploy` | 3 migrations aditivas, **zero DROP** | 2026-09-10 |
| `npx tsx scripts/marcar-catalogo.ts` | 38 marcações, 1,9% do catálogo | 2026-09-10 |

Censo do M16: **156 → 161 serviços, 149 → 154 ações**. Migrations: **83**.

## 13. ENT03a — o catálogo sob git, a competência, a tesouraria e as assinaturas

> ⚠️ **Esta seção é a PRIMEIRA METADE do ENT03a**, escrita quando o lote ainda estava
> aberto. O fechamento — as duas decisões, os tripwires, as varreduras e as telas — está na
> **seção 14**, e é lá que a definição de concluído é respondida.

### 13.1 O instrumento de medição entrou sob controle de versão

`gestao-publica-execucao/` não era repositório git. O catálogo de 2037 cláusulas é a única
medida de quanto do termo de referência está atendido, e uma marcação errada, um script mal
rodado ou um arquivo sobrescrito não tinham como ser desfeitos nem revistos.

Dois commits, e a divisão é deliberada:

| Commit | O que é |
|---|---|
| `aa41282` | **estado zero** — as 2037 cláusulas em `NAO_VERIFICADO`, evidência vazia |
| `fe3c7db` | as 38 marcações de ENT01 e ENT02, legíveis como diff de exatamente 76 linhas |

Reconstruí o estado zero de propósito. Commitar o catálogo já marcado teria enterrado as 38
marcações no commit inicial, invisíveis — que é o oposto de pôr o instrumento sob revisão.

Conferido antes do primeiro commit: **nenhum valor de credencial** nos arquivos, só as
palavras em prosa. O PDF fonte está versionado e seu `sha256` confere com
`resultado-auditoria.json`. O `.cache-tr-layout.txt` **não** foi ignorado, e o `.gitignore`
diz por quê: ele é derivado por `pdftotext -layout`, cuja saída depende da versão do
poppler, e os ids de cláusula que saem desse recorte são a chave de toda evidência já
registrada.

### 13.2 A competência — o defeito estava no banco de desenvolvimento

ADR **aceito** em `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`, alternativa A.

⚠️ **A medição achou o defeito no dado real, não em hipótese.** No banco de desenvolvimento
havia doze empenhos com `Empenho.data` de **10/04** e `criadoEm` de **09/09** — cinco meses
de distância. Uma consulta de saldo em 30/06 cortada por `criadoEm` teria respondido que
nenhum dos doze existia. Todos são fatos de abril.

⚠️ **E a competência já era conhecida — era calculada e jogada fora.**
`MovimentoDotacaoParams` **já tinha** o campo `data`, com o comentário
*"A data do FATO. É ela que corta a MSC e o balancete — nunca o `criadoEm`"*, escrito antes
deste ADR. Cinco dos seis chamadores já a informavam bem (1º de janeiro para a LOA, a data
do decreto para o crédito, a data do empenho). `registrarMovimentoDotacao` usava esse valor
**apenas** para a perna do razão e não o gravava no movimento. Não se introduziu um conceito
novo: persistiu-se o que já existia.

Migration aditiva de três passos numa transação — `competencia` nullable, backfill,
`NOT NULL` — mais `competenciaDerivada`. **Zero `DROP`.** O backfill recuperou a data do
próprio razão (`LancamentoContabil.dataTransacao` da perna, `origemId = movimento.id`) e de
`Empenho.data`: **14 linhas, 0 derivadas, 0 nulas.**

⚠️ **O grant não foi afrouxado, e isso foi medido antes e depois.** `MovimentoDotacao` não
consta de `ESCRITA_MUTAVEL_DO_RUNTIME`, e `gestao_app` tem apenas `INSERT, SELECT` — antes
e depois da migration. O `UPDATE` do backfill rodou uma vez, dentro da migration, pelo papel
`gestao`, que é o de migração.

**A assinatura antiga não sobreviveu.** `saldosDaFicha(fichaId, deps)` foi **retirada**; no
lugar entraram `saldosCorrentesDaFicha`, `saldosDaFichaPorCompetencia` e
`saldosDaFichaPorRegistro`. Não ganhou um terceiro parâmetro opcional de propósito: um
opcional deixaria todos os chamadores de hoje respondendo pelo eixo antigo sem que ninguém
tivesse decidido isso. A retirada quebrou 9 arquivos na compilação, e cada um foi olhado.

### 13.3 ⚠️ Três acusações, e as três eram contra mim

**(a) O c2 da caracterização teria deixado passar.** Ele afirmava, no docblock, vigiar a
chegada de uma coluna de competência. A asserção era `nomes.filter(/^data/i)` — e a coluna
criada chama-se `competencia`. **Teria passado verde sobre exatamente o que dizia vigiar.**
A lição não é sobre a regex: um teste de caracterização que vigia um NOME de coluna vigia a
grafia, não o conceito. O c2 atual afirma o conjunto exato de colunas.

**(b) `test/` não era typechecked por nenhum tsconfig.** `tsconfig.json` exclui `test`; os
outros dois nunca a incluíram. A retirada de `saldosDaFicha` acusou 9 arquivos em
`modules/**` na compilação e **zero** em `test/**` — o teste de caracterização só quebrou em
tempo de execução. `test/**/*.ts` entrou em `tsconfig.backend.json`, e as 12 quebras que
isso revelou foram corrigidas: quatro imports sem `.js` (um deles em `lib/pdf/gerar.ts`, que
fazia o módulo resolver como `any` e apagava três erros de tipo por tabela) e cinco
`estornoDeId: null` onde o tipo diz `string | undefined`.

⚠️ **`test/ui/*.tsx` continua FORA** — exige `jsx` e `lib: dom`, que o config de backend não
tem de propósito. Pendência declarada, não resolvida.

**(c) O guard nasceu errado, e um teste existente me corrigiu.** A primeira versão de
`exigirCompetenciaEmExercicioAberto` recusava exercício ENCERRADO **e também** exercício
INEXISTENTE. Ela derrubou o `t5` do M16 — *"anular em JANEIRO um empenho de dezembro travado
PASSA"* —, cuja anulação tem data de **20/01/2027**, ano ainda não aberto. Recusar ali
impediria o ente de **corrigir em janeiro um erro de dezembro**.

A condição do ADR é "competência em período **FECHADO**". Um ano que ninguém abriu não é um
período fechado: é um período que não começou. Tratá-los igual transformou uma proteção
contra antedatar numa proibição de pós-datar. O guard passou a perguntar `estaEncerrado`, e
o `c3b` prende a distinção.

### 13.4 ⚠️ O custo do guard, medido em vez de suposto

O `t8` do M03 (dois créditos concorrentes, 5 rodadas) começou a estourar o limite de 5000 ms
do vitest. Em vez de subir o timeout, medi — as mesmas 18 suítes, nas duas condições:

| Condição | `t8` |
|---|---|
| sem o guard | **2745 ms** — passa |
| com o guard, sem memória | **5035 ms** — estoura |
| com o guard, memorizado | **3395 ms** — passa |

O guard era chamado uma vez por movimento, e um decreto com vários itens repetia o mesmo
`SELECT` em `Exercicio` com o lock da ficha na mão. A memória vive por transação
(`WeakMap` chaveada no `tx`) e guarda só ANO ABERTO — o encerrado lança e nunca é
memorizado. E o cliente de longa vida fica **fora** da memória: memorizar num objeto que
vive o processo inteiro deixaria o guard respondendo "aberto" para sempre depois de um
encerramento. A distinção é `"$transaction" in tx`, e ela erra para o lado de não
memorizar.

### 13.5 O parser de OFX conferido contra terceiro — e o que ele revelou

O prompt manda: *"Se o teste do OFX usar o seu parser para conferir o seu parser, ele passa
com qualquer interpretação errada consistente."* Era exatamente o caso: os 23 testes de
`ofx.test.ts` montam um OFX com um helper deste repositório e comparam com o que o próprio
teste acabou de escrever.

O desmentidor é o **`ofxtools` 1.1.1** (PyPI, terceiro). `scripts/oraculo-ofx.py` lê
`packages/ofx/corpus/*.ofx` com ele e congela o resultado em `esperado.json`;
`packages/ofx/oraculo.test.ts` confronta o nosso parser com o que o outro leu.

**Resultado: os dois concordam em todos os campos** — 3 arquivos, 6 transações. E a
conferência achou duas coisas que nenhum teste anterior podia achar:

⚠️ **1. Os arquivos dos testes antigos não eram OFX válido.** O `ofxtools` recusou o
cabeçalho de quatro linhas (falta `SECURITY`, `ENCODING`, `COMPRESSION`, `OLDFILEUID`,
`NEWFILEUID`), e recusou o corpo sem `<SIGNONMSGSRSV1>` e sem `<LEDGERBAL>`. Nenhum deles
teria vindo de um banco de verdade. Ser mais permissivo na entrada é menos perigoso que ler
valor errado, então não virou defeito — mas o corpus novo é conforme.

⚠️ **2. A virada de mês.** `<DTPOSTED>20260131235900[-3:BRT]` — o último minuto de janeiro
em Brasília. O `ofxtools` normaliza para UTC e guarda `2026-02-01T02:59Z`; lido como data em
UTC, isso é **fevereiro**. O nosso parser guarda **31/01**.

**Um dia de diferença numa transação do último dia do mês é uma mudança de mês**, e a
conciliação bancária é mensal. Quem está certo é o nosso parser, por razão de domínio: a
conciliação é feita contra o extrato que o tesoureiro tem na mão, e o extrato do banco
brasileiro imprime 31/01. O `esperado.json` guarda **as duas** leituras — `instanteUtc`, o
oráculo cru, e `dataLocalDeclarada` — e um teste prova que elas divergem, para que o caso de
fronteira não desapareça do corpus.

⚠️ **`ofxtools` não entrou no `package.json`.** É ferramenta de conferência, roda à mão
quando o corpus muda; o `esperado.json` é versionado justamente para que a suíte não dependa
de python nem de rede.

### 13.6 A movimentação bancária (item 2) — e o defeito que ela revelou

`MovimentoBancario` (TR 5.62): depósito, saque, aplicação, resgate, rendimento e tarifa.
Era a pendência `TESOURARIA-MOVIMENTACAO`, e ela está fechada.

⚠️ **O saldo é conferido DENTRO da transação, sob lock** (posto 17 do `packages/locks`,
tomado ANTES da leitura). "No momento da operação" é exigência técnica: conferir antes de
abrir a transação deixa a janela clássica — dois saques de 600 numa conta de 1.000 leem
ambos "há saldo" e gravam ambos. O lock é advisory e não `FOR UPDATE` porque **não há
linha de saldo para travar**: o saldo é derivado dos fatos, e é isso que o mantém honesto.

⚠️ **Tarifa e rendimento NÃO passam pelo guard, e é decisão.** O banco debita a tarifa por
conta própria; quando o extrato chega, o débito já aconteceu. Recusar o registro por falta
de saldo não desfaz nada — só afasta o sistema do extrato, que é o oposto do que a
conciliação precisa.

⚠️ **Um só caminho para os mesmos fatos.** A enumeração dos fatos que movem a conta vivia
dentro de `conciliacao.ts`. Quando o saldo precisou da mesma resposta, ela foi
**extraída** para `caixa.ts`, não copiada. Uma segunda consulta teria produzido o pior
sintoma possível: o guard aprovando um saque que a conciliação, minutos depois, mostraria
como impossível.

#### ⚠️ E isso expôs um defeito que já existia

A conciliação vale por uma identidade auto-executável — ela **lança** quando não fecha, em
vez de devolver diferença sem nome. Ela só fecha se o lado interno espelhar o que o razão
registrou **na conta contábil desta conta bancária**. A transferência entre contas
próprias não entrava no lado interno **nunca**, e o resultado dependia de um detalhe que
ninguém tinha notado:

| Contas | Razão na contábil da origem | Antes | Agora |
|---|---|---|---|
| mesma conta contábil | D e C na mesma conta → **líquido zero** | fechava | fecha (não entra) |
| contas contábeis **diferentes** | C de X → **move** | **`CONCILIAÇÃO NÃO FECHA`** | fecha (entra) |

A conciliação de qualquer conta que tivesse transferido para conta de outra natureza
contábil **simplesmente não saía**. O critério correto não é "incluir" nem "não incluir":
é entrar **quando o fato moveu a conta contábil desta conta**.

⚠️ **E a regra foi conferida por MUTAÇÃO**, porque um cenário com uma conta só não a
distingue: trocar por "inclui sempre" derruba `t12` e `t14`; trocar por "nunca inclui" — o
comportamento antigo — derruba `t13` e `t14`. Um teste que passasse nas três variantes não
estaria provando nada.

### 13.7 As assinaturas da despesa (item 4)

Empenho, liquidação e ordem de pagamento entram na **mesma** `FilaDeAssinatura` do ENT02 —
não numa paralela. O documento canônico vira `Anexo` de origem SISTEMA, e três coisas vêm
de graça: é baixável pela rota do ENT02 com autorização por registro, é assinável pela
fila, e a conferência de integridade do `lerArquivo` passa a valer para ele.

⚠️ **O escopo não afrouxou.** O anexo do empenho é escopado pelo EMPENHO; o da liquidação,
pela LIQUIDAÇÃO; o da ordem, pela liquidação dela — como o M16 já faz. Devolver "ENTE" (o
que o borderô faz, e ali com razão) daria a quem anexa no nível do ente o poder de produzir
o documento assinável de outra unidade. O `t7` prende isso.

#### ⚠️ Um defeito meu, achado e corrigido dentro do lote

`porNaFila` gravava o `Anexo` **antes** de abrir a fila, e as duas não cabem numa transação
só. Uma tentativa com modo QUALIFICADA criava o anexo e morria na fila — e o guard de "um
documento por fato" passava a recusar a tentativa **seguinte**, correta. **O empenho ficava
impossível de assinar por qualquer modo, para sempre.**

A correção confere as pré-condições antes de gravar, pela **mesma** função que a fila usa
(`exigirFilaViavel`, extraída do M22) — não por uma cópia. Conferido por mutação: remover a
conferência prévia derruba `t6`, `t8` e `t9`.

⚠️ **E os dois `rejects.toThrow()` vazios viraram asserções sobre o motivo**, como o lote
manda: "Ainda não é a sua vez: falta X (posição 1)" e "nenhum provedor de certificado
configurado". Vazios, ficariam verdes se a recusa viesse de autorização ou de id errado —
ambos compatíveis com a fila **não** estar sendo ordenada.

### 13.8 O catálogo — 47 de 2037 (2,3%)

Nove cláusulas novas, e **nenhuma** é `VALIDADO_LOCALMENTE`: não há tela. O motor existe e
é testado; a superfície não.

A marcação mais útil das nove é uma **ausência**. A **5.10.2.6** pede vincular *uma ou
mais* fontes de recurso à conta bancária, e o modelo tem exatamente **uma** (`fonteId`,
`NOT NULL`). O controle de saldo por fonte (5.10.2.19) funciona hoje porque, neste modelo,
saldo por fonte **é** saldo por conta — com N fontes por conta ele precisaria de um eixo
novo. Sem essa linha, a 5.10.2.19 pareceria fechar um requisito que só fecha por
coincidência de modelagem.

### 13.9 ⚠️ O que NÃO foi feito neste lote

| Item | Estado |
|---|---|
| 1. Competência | **feito** — ADR, migration, guard, testes |
| 2. M09 | **parcial.** Movimentação bancária **feita**; conciliação parcial e pendências automáticas **já existiam** (verificadas). **Faltam**: pendências manuais (5.10.2.45), cópia para o período seguinte (5.10.2.46) e seleção múltipla com soma (5.10.2.47) |
| 3. Telas do financeiro | **não iniciado** |
| 4. Fila de assinaturas | **feito** — empenho, liquidação e ordem |
| 5. `packages/integracao` | **não iniciado.** Só o exercício do OFX (13.5). Cofre de credenciais, validação contra esquema, detecção de duplicidade em retransmissão e custódia de certificado continuam ausentes |
| 6. `docs/dependencias-externas.md` | **feito no que era conhecível** — ver 13.10 |

⚠️ **A definição de concluído do ENT03 continua NÃO atendida**: nenhum dos quatro percursos
pela interface existe. Três itens deste lote (2 parcial, 3 e 5) seguem abertos.

#### ⚠️ E um achado que muda o desenho do que falta em 2

As cláusulas **5.10.2.46** ("copiar automaticamente as pendências não baixadas para **a
próxima conciliação**") e **5.10.2.49** ("visualizar e imprimir conciliações de períodos
anteriores") pressupõem **conciliações discretas** — objetos com começo, fim e fechamento.

O modelo atual é **cumulativo até um corte**: `conciliacaoBancaria(conta, corte)` soma tudo
com `lte: corte`. Isso faz a *cópia* de pendências acontecer **por derivação** (uma linha
não baixada continua aparecendo no corte seguinte, sem ninguém copiar nada) — mas deixa
"a próxima conciliação" e "períodos anteriores" **sem âncora**: não há o que listar.

Fechar essas duas exige um fato de **fechamento de conciliação**, e essa é uma decisão de
modelo, não uma tela. Registrada aqui para ser decidida de propósito, e não descoberta no
meio da implementação — que é exatamente a lição que o ADR da competência deixou.

### 13.10 O inventário de dependências (item 6)

Uma linha saiu de `CODIGO_LOCAL_SEM_VALIDACAO` para o estado novo
`VALIDADO_CONTRA_TERCEIRO` — o OFX, conferido contra o `ofxtools`. Vale para **formato**, e
não substitui aceite de órgão; por isso o estado é novo em vez de reaproveitar um existente.

Duas correções de fato e duas linhas que faltavam:

- a conciliação do M09 **não** existia "só como schema" — a afirmação estava errada;
- **CNAB**: o layout é **por banco**, não único. Escrever contra a especificação genérica
  da FEBRABAN produz arquivo que o banco recusa;
- **certificado A3**: fisicamente diferente do A1 — a chave não sai do dispositivo, e a
  assinatura acontece **na máquina do usuário**, não no servidor. Um adaptador que trate os
  dois igual não funciona para nenhum dos dois. Isso muda a arquitetura do item 5, não a
  configuração dele.

⚠️ **O que continua vazio, e por quê.** As colunas *credencial*, *convênio* e *protocolo*
seguem vazias em quase toda a tabela porque **nada foi solicitado a órgão nenhum** —
solicitar é ato externo, fora da autorização deste trabalho. O que era conhecível sem
contato externo foi preenchido. Preencher o resto exigiria inventar, e um inventário
inventado é pior que um vazio: ele para de ser lido como pendência.

### 13.11 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` (fim do lote) | **162 arquivos, 1649 testes, 0 falhas, 356,1 s** | 2026-09-10 |
| `npm run test:tudo` (item 2) | 161 arquivos, 1640 testes, 0 falhas, 408,6 s | 2026-09-10 |
| `npm run test:tudo` (item 1) | 160 arquivos, 1623 testes, 0 falhas, 411,6 s | 2026-09-10 |
| `npm run typecheck` (backend, agora com `test/**/*.ts`) | 0 erros | 2026-09-10 |
| `npm run typecheck:app` | 0 erros | 2026-09-10 |
| `npm run typecheck:scripts` | 0 erros | 2026-09-10 |
| `npx prisma migrate deploy` | 1 migration aplicada, 0 `DROP` | 2026-09-10 |
| `oraculo-ofx.py` (ofxtools 1.1.1) | 3 arquivos, 6 transações, todos os campos conferem | 2026-09-10 |
| `psql` — grants de `MovimentoDotacao` | `gestao_app`: `INSERT, SELECT` antes e depois | 2026-09-10 |
| `psql` — backfill | 14 linhas, 0 derivadas, 0 nulas | 2026-09-10 |

⚠️ **Duas execuções intermediárias foram vermelhas, e as duas eram defeito meu**, não falso
alarme: o `t5` do M16 (guard recusando ano não aberto — ver 13.3c) e o `t8` do M03 (custo do
guard sem memória — ver 13.4). Ambas foram corrigidas no código, nenhuma no teste.

⚠️ **E três regras foram conferidas por MUTAÇÃO**, porque passar não prova nada quando o
cenário não distingue as alternativas:

| Regra | Mutação | Quem acusou |
|---|---|---|
| inclusão da transferência no lado interno | "inclui sempre" | `t12`, `t14` |
| idem | "nunca inclui" (comportamento antigo) | `t13`, `t14` |
| pré-condição da fila antes de gravar | remover a conferência | `t6`, `t8`, `t9` |

**Migrations do lote:** 4, todas aditivas, **zero `DROP`**. Total agora: 87.
**Censo M16:** 161 → 163 serviços, 154 → 156 ações, mais 3 composáveis e 1 guard
classificados.

## 14. ENT03a — o fechamento: as duas decisões, os tripwires e as telas

> ⚠️ **O lote FECHA.** Os quatro percursos da definição de concluído existem **pela
> interface**, com dado persistido e visível **após recarga** — provado por smoke de
> navegador, 28 passos, 0 falhas, **duas execuções seguidas**. O que ficou de fora está
> em **14.8**, e o item 5 saiu de escopo por decisão da revisão (vai para o ENT03b).

### 14.1 Os 14 tripwires, provados por mutação

O `c2` afirmava, no próprio docblock, vigiar a chegada de uma coluna de competência. A
asserção era `/^data/i`, e a coluna criada chama-se `competencia`: **ele teria passado
verde sobre exatamente o que dizia vigiar.**

Um tripwire que nunca ficou vermelho tem **valor desconhecido**, e é pior que não ter — dá
a sensação oposta. `scripts/tripwires-caracterizacao.ts` muta o que cada teste diz vigiar,
confere que fica vermelho e reverte (o revert é garantido por `finally`; um script destes
que morresse no meio deixaria código mutado no repositório).

**14 de 14 PROVADOS.** Cada um verde-antes e vermelho-com-mutação.

⚠️ **E o `c14` exigiu mutar OS DOIS guards.** Desde o ADR da competência, `empenhar` confere
o exercício **da ficha** e o **da competência**. Remover só um deixaria o outro recusando, e
o tripwire ficaria verde provando nada — que é o modo de falha que o script existe para
achar.

### 14.2 Varredura (a) — cobertura de tsconfig

**34 arquivos estavam fora dos três**, e dois doeram: `middleware.ts` (produção, roda em
**toda requisição**) e `prisma/seed/**` — 29 arquivos, **cinco deles `.test.ts` que a suíte
EXECUTA**. Testes rodando sem nunca terem sido compilados.

**Buraco na rede é pior que ausência de rede**: três typechecks verdes davam a conclusão
errada sobre o repositório inteiro. Agora são **698 de 698**, e um teste de ~6 s impede o
buraco de reabrir.

### 14.3 Varredura (b) — efeito colateral antes da operação guardada

A forma do defeito do `porNaFila` **repetia em `gerarBordero`**: ele grava o `Bordero` e só
depois abre a fila. Com **signatário repetido** a fila recusa, o borderô fica órfão, e "o
lote já tem borderô" passa a recusar a tentativa seguinte — **o lote fica impossível de
transmitir, para sempre.** Reproduzido em `t8b` antes de corrigir.

As demais formas foram verificadas e estão limpas: a numeração aloca **dentro** da
transação (rollback devolve), o outbox **não tem produtor** e já tinha guarda própria, e
não há consumo de certificado.

### 14.4 Varredura (c) — a data civil do ente

ADR próprio: **comparação de data no domínio usa a data civil do ente, nunca UTC.**
`packages/datas` é a régua — com `Intl`, não `-3` cravado: o Brasil teve horário de verão
até 2019 e pode voltar a ter.

| Área | O defeito | A consequência |
|---|---|---|
| **período fechado** | a janela de `2026-12` era 01/12 00:00Z a 31/12 23:59Z — civilmente **30/11 21:00 a 31/12 20:59** | o lançamento de **31/12 às 22:00 ESCAPAVA** da trava de dezembro |
| **período por data** | a janela era `Date` — instante para o que é dia civil | "travar de 10/01 a 20/01" começava às 21:00 do dia **09** |
| **competência** | `getUTCFullYear()` no guard da arrecadação | guia de **31/12 às 22:00** recusada como "fora do exercício 2026" |
| **cota mensal do CMD** | `getUTCMonth()` | empenho de **30/06 às 22:00** contado contra **julho** |
| **ordem cronológica** | comparava instantes | duas liquidações do mesmo dia **não empatavam**, e o desempate pelo número — que dá ordem TOTAL ao art. 141 — **nunca rodava** |
| **vencimento** | `toISOString().slice(0,10)` | a nota de empenho e o borderô, **documentos assinados**, imprimiam um dia a mais |

⚠️ **Nenhum aparecia nas fixtures**: quase toda fixture usa **meio-dia UTC**, e ao meio-dia
os dois eixos coincidem. Os testes novos usam horas de noite de propósito.

Formato externo (SAGRES, SIGA, MANAD, BB, OFX) permanece em UTC — converter ali produziria
arquivo recusado. A lista de exceções tem **um motivo por linha**, e é ela que faz a
próxima ocorrência ser decisão de alguém em vez de descuido.

### 14.5 Decisão 1 — a conta admite mais de uma fonte

Município pequeno não abre uma conta por fonte: o controle de destinação acontece **dentro**
da conta. Vínculo muitos-para-muitos, migration aditiva, e a fonte única virou a **primeira
linha** do rol no backfill — sem isso toda conta existente ficaria com rol vazio e o guard
recusaria **toda** movimentação no dia seguinte à migration.

⚠️ **A fonte continua obrigatória no movimento**, e o motivo é o oposto do que parece: conta
multifonte significa que a fonte precisa ser **declarada**, porque não dá mais para
inferi-la.

⚠️ **E a regra virou UMA.** `conta.fonteId !== informada` estava escrito à mão em **quatro**
lugares — e com a conta multifonte os quatro passariam a **recusar o pagamento legítimo**
pela segunda fonte, que é o caso que a decisão veio permitir. A regra mora em
`guard-fonte.ts`; cinco sítios a chamam.

**Rol vazio cai para a fonte padrão**, e não é brecha: a primeira versão recusava tudo, o
que tornaria **inutilizável** qualquer conta criada por fora. O fallback admite
exatamente UMA fonte — a mesma de antes.

### 14.6 Decisão 2 — a conciliação é objeto discreto

**O que se persiste é o JUÍZO, não o saldo.** Saldos e enumeração continuam derivados.
Congelar valor no encerramento criaria a segunda verdade — e a tela de conferência é o pior
lugar do sistema para tê-la: um valor congelado divergindo do razão faria o operador
conferir o sistema contra ele mesmo.

⚠️ **"Cópia para o período seguinte" não é cópia.** `t7` prova pelo dado: julho enxerga a
pendência de junho e a **contagem de linhas no banco não muda**. Duplicar faria a soma
contar a mesma pendência duas vezes.

**Pendência manual é decisão registrada, não fato**: aponta motivo e **não cria lançamento**
(`t5`). **Encerrada é imutável**, e o estado é **derivado** — `t1` confere que a tabela não
tem `status`, `encerrada` nem `estado`.

### 14.7 As telas — o item que fecha o lote

Quatro telas, quatro Server Actions, duas portas, e um smoke que percorre os quatro
caminhos: `/financeiro/movimentacao`, `/financeiro/conciliacao/periodo`,
`/financeiro/lotes`, `/despesa/assinaturas`.

⚠️ **A recarga é o ponto.** Conferir a tela logo depois do envio prova que o React
renderizou; conferir depois de um `goto` novo prova que **o servidor tem o dado**.

#### O que o smoke achou, e que nenhum teste de módulo acharia

1. **A página do período devolvia 500** quando a conta não tinha conta contábil mapeada. O
   domínio recusava com a mensagem certa; a página deixava a exceção subir. **Um 500
   esconde a única informação que o operador precisava ler**: qual conta parametrizar.
2. **O erro cru do Prisma vazava para a tela** ao repetir um período. O índice único
   continua sendo a garantia — um `findFirst` antes do `create` perderia a corrida —, mas
   a **mensagem** agora diz o que fazer.
3. `<input type="date">` **não aceita** `type()` com `YYYY-MM-DD`: o Chrome espera o
   formato do locale, e o ISO vira `Invalid Date`.
4. O campo de valor é **mascarado** e o `name` está no **hidden** — um seletor por `name`
   casa só o hidden, que o puppeteer recusa clicar.

⚠️ **E as ações novas precisaram ser CONCEDIDAS ao perfil.** O M16 recusou com a mensagem
exata do que faltava — *"Não é escopo: é a ação"* — e foi por ela que se soube o que pedir.
O caminho de atualização (`conceder-acoes-ao-perfil.ts`) existe justamente porque perfil já
criado não recebe ação nova sozinho.

### 14.8 ⚠️ O que NÃO foi feito

| Item | Estado |
|---|---|
| 1. Completar o item 2 | **feito** — pendências manuais, períodos anteriores e a soma da seleção múltipla |
| 2. Telas — os quatro percursos | **feito**, com smoke |
| 3. `packages/integracao` | **fora de escopo por decisão da revisão** — vai para o ENT03b |
| 4. `docs/dependencias-externas.md` | **feito no que é conhecível sem contato externo** |

**Pendências nomeadas, nenhuma delas silenciosa:**

- `SELECAO-MULTIPLA-UI` — a soma da seleção existe e é pura; **falta a tela** de seleção
  múltipla de lançamentos (5.10.2.47 ficou `PARCIAL`);
- `CONCILIACAO-PERIODO-PDF` — lista e lê períodos anteriores; **falta a impressão**;
- `ROL-DE-FONTES-UI` — a tela mostra o rol por conta, mas **não há cadastro** dele;
- `DATA-CIVIL-RESTANTES` — restos a pagar, vigência de contrato, bimestre do RREO;
- `DATA-CIVIL-APRESENTACAO` — ~10 sítios em `app/` e `lib/` ainda imprimem por UTC;
- `M07-FONTE-NO-MOVIMENTO` — o movimento extraorçamentário **não tem fonte** no modelo, e
  por isso o saldo por fonte tem um balde `(sem fonte declarada)`. Atribuí-lo à fonte
  padrão seria inventar — justamente no número que prova que recurso vinculado não custeou
  outra coisa;
- `test/ui/*.tsx` entrou no typecheck; **`BORDERO-CONVENIO-BANCARIO` segue de pé**: o envio
  ao banco é indisponível, e a tela **não oferece o botão** em vez de simular.

### 14.9 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` | **167 arquivos, 1694 testes, 0 falhas, 390,1 s** | 2026-09-10 |
| `npx tsx scripts/smoke-ent03a.ts` | **28 passos, 0 falhas** — duas execuções seguidas | 2026-09-10 |
| `npx tsx scripts/tripwires-caracterizacao.ts` | **14 de 14 provados** | 2026-09-10 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **698 de 698 cobertos, 0 descobertos** | 2026-09-10 |
| `npx next build` | limpo, com as 4 rotas novas | 2026-09-10 |
| `npm run typecheck` · `:app` · `:scripts` | 0 erros nos três | 2026-09-10 |

**Migrations do lote:** 8 no ENT03a, **todas aditivas, zero `DROP`**. Total: 91.
**Censo M16:** 156 → **167 serviços**, 149 → **160 ações**.
**Catálogo:** 38 → **51 de 2037 (2,5%)**, das quais **7 novas em `VALIDADO_LOCALMENTE`**.

## 16. ENT03b — o molde de recurso, os cinco cadastros e a medição que falhou

**Data:** 2026-09-11. **Estado:** fechado, parado no gate.

⚠️ **O LOTE MUDOU DE MÉTODO, E A MUDANÇA FOI MEDIDA — INCLUSIVE ONDE ELA NÃO FUNCIONOU.**
A revisão fixou a meta: **60 a 90 cláusulas** marcadas com evidência, contra ~10 de cada um
dos cinco gates anteriores. Saíram **40**. A seção 16.8 explica por quê, com o número.

### 16.1 · Antes de tudo: `DATA-CIVIL-RESTANTES`, e o buraco que ela escondia

A pendência nomeava **cinco** sítios. A medição achou **trinta e cinco**.

⚠️ **A pendência só listava o que a guarda sabia ler.** `test/data-civil.test.ts` procurava
duas formas — `getUTCFullYear` e `toISOString().slice(0,10)`. A forma **dominante** era a
terceira: a **construção** da janela por `new Date(Date.UTC(...))`.

É o caso do `c2` outra vez: uma guarda que dizia vigiar o eixo de data e ficava verde sobre
a metade do eixo que ela não sabia ler.

| Sítio | O que a janela em UTC fazia |
|---|---|
| `janelaDoBimestre` | **régua de OITO anexos do RREO** — o 1º bimestre de 2026 ia de **31/12/2025 às 21:00** a **28/02 às 20:59** civis |
| `janelaDosDozeMeses` | a janela da **RCL**, que entra no limite de pessoal e no de endividamento |
| `guard-cmd.janelaDoMes` | **é guard** — ele classificava o empenho pelo mês civil e somava o consumido por janela UTC: o empenho de 30/06 às 22:00 era cobrado contra julho **e não entrava na soma de junho nenhuma das duas vezes** |
| `msc/parsearCompetencia` | o encerramento do exercício caía **fora** da MSC de dezembro e reaparecia como abertura de janeiro: **a M3 não fechava** |
| `ordem-cronologica` (M12) | o pagamento de 30/06 às 22:00 **omitido** da publicação do art. 141, §3º |
| `m11.vigenciaFim` | prorrogar 150 dias atravessando a virada do horário de verão **movia o dia do vencimento** |
| `m02.gerarDecreto*` | **decreto é documento assinado**, e imprimia um dia a mais para vigência da noite |
| + `m10` (5), `rgf-anexo2/3/4/6`, `mde-*`, `m07`, `m20`, `m26` (3) | |

**A MSC saiu da lista de "leiaute externo", por decisão.** O que o leiaute define é o
**formato** do que se escreve; o que a janela decide é **quais fatos entram na remessa** — e
essa é pergunta de domínio. O Siconfi recebe uma *competência*, não um instante.

⚠️ **Provado por mutação: 11 de 11** (`scripts/mutacoes-eixo-de-data.ts`), devolvendo a cada
sítio **exatamente o código que estava lá antes do conserto**. **Duas ficaram VERDES na
primeira rodada, e as duas eram achados:**

| Mutação | Por que nada acusava |
|---|---|
| `vigenciaFim` de volta a milissegundos | o teste que eu havia escrito prorrogava **365 dias de 30/06/2018 a 30/06/2019** — as duas pontas FORA do horário de verão, onde as duas aritméticas coincidem. Trocado por **150 dias**, que cruzam a virada de 04/11 |
| `janelaDoBimestre` de volta a `Date.UTC` | **nenhum teste do repositório acusava** — todos os anexos passavam porque as fixtures usam meio-dia. Criado `m12-janelas.test.ts`, que afirma o **instante exato** das bordas: afirmar só o dia civil passaria com 00:00 e com 03:00 locais |

⚠️ **E as fixtures dos testes estavam em Greenwich.** Nove arquivos acusaram, e em todos a
FIXTURE é que estava errada: `new Date("2026-01-01T00:00:00Z")` como "primeiro instante do
período" é **31/12 às 21:00 do ano anterior** — o `t6b` do M10 chamava de "primeiro instante"
um fato da véspera.

### 16.2 · O custo da suíte: partida, e a conta fecha

| | arquivos | testes | tempo |
|---|---:|---:|---:|
| **rápida** (`npm run test:rapido`) | 55 | 583 | **~9 s** |
| **completa** (`npm run test:tudo`) | 180 | 1.830 | **~700 s** |

⚠️ **É decisão de agendamento, não de rigor.** A exclusão é **CALCULADA** pelo que o arquivo
importa — não uma lista escrita à mão que envelhece calada —, e
`test/particao-da-suite.test.ts` prova que a **união das duas é o conjunto inteiro** e que
nenhum arquivo da partição rápida alcança uma porta do banco. **Provado por mutação:** pôr um
`new PrismaClient()` num teste rápido deixa o guard vermelho.

⚠️ **O custo da partição foi MEDIDO (3,6 s) e MEMOIZADO (1,2 s)**, não contornado com timeout
maior. E o `raizes-dominio.test.ts` acusou a primeira versão por enumerar as raízes à mão —
o guarda dos guardas segue funcionando.

### 16.3 · PARTE 1 — o molde

`lib/molde/` (dado puro) + `components/molde/` (superfície) + `lib/portas/molde.ts` (o que
precisa do servidor). De **um descritor** saem: listagem com filtros compostos, ordenação por
URL, paginação, exportação CSV, **seleção múltipla com soma no servidor**, formulário de
criação, **detalhe com cinco abas fixas** (dados, campos adicionais, anexos, histórico,
relacionados) e **barra de ações amarrada a permissão nomeada**.

**Os três limites foram respeitados, e um deles doeu:**

1. **provado pelos cadastros do próprio lote** — quatro, nesta sessão;
2. **cadastro que não coube escapa** — o consórcio precisou de UM argumento a mais no
   detalhe (o exercício, porque os saldos são anuais). Ele cabe; se precisasse de dois, viraria
   tela escrita à mão;
3. **nenhuma regra de negócio dentro do molde** — o `FormularioDeRecurso` diz isso no
   docblock, e o que ele valida é `required`/`min`, conveniência de digitação. Quem recusa é o
   caso de uso, dentro da transação.

⚠️ **O QUE O MOLDE NÃO GENERALIZA, E É DECISÃO:** anexos e campos adicionais continuam com
**uma FK por tipo de dono**. A tentação era um par `(donoTipo, donoId)` livre — e o preço
apareceria no primeiro id errado: o banco deixaria de garantir que o registro existe, e um
`donoId` digitado errado viraria anexo **órfão** que nenhuma tela mostra e nenhuma limpeza
acha. O molde automatiza a **superfície**, não o modelo: cadastro novo com anexo custa uma
migration aditiva e **uma linha** no descritor.

⚠️ **`definirRecurso` verifica em TEMPO DE MÓDULO e ESTOURA.** Aba de anexos sem dono, coluna
somável que não é dinheiro, ação sem crachá — o `next build` falha junto. O erro aparece
antes de alguém abrir a página.

⚠️ **E a fronteira acusou o molde duas vezes**, as duas com razão:
- `lib/portas/recursos/dados.ts` importava `LinhaDoMolde` de `components/` — **o dado
  dependendo do pixel**. Os DTOs foram para `lib/molde/tipos.ts`;
- `somarSelecionadas` morava na porta e arrastava `next/headers` para o tsconfig do backend.
  Função pura em porta é dependência que viaja.

### 16.4 · PARTE 2 — os cinco cadastros, e o que cada um trouxe de próprio

| Cadastro | O que ele tem que os outros não têm |
|---|---|
| **Convênios** (M28) | **três saldos independentes** — a liberar, a prestar contas, glosado. Por isso NÃO há mapa de sinal: um `Record<Tipo, 1 \| -1>` obrigaria a inventar um zero, e zero ali é mentira que o compilador não pega. O papel do ente (concedente/convenente) é NOT NULL sem default: o efeito contábil é OPOSTO |
| **Precatórios** (M29) | a **fila do art. 100**, que não é a do art. 141 e não é um `ORDER BY`: ela depende do saldo devido (Σ dos movimentos) e da regra de que a preferência do §2º só vale DENTRO dos alimentares |
| **Consórcios** (M30) | o **contrato de rateio anual** (art. 8º). O teto é a **soma** do original com os aditivos, nunca "o último vale" — e o exercício do movimento é DECLARADO, não derivado da data |
| **Medições de obra** (M11) | **liquidar obra exige medição aprovada**, na transação da liquidação. Bordas de período **inclusivas**: acabar em X e começar em X se sobrepõe |
| **Controle interno** (M31) | **regime de superfície, declarado** — ele não move o razão. Três segregações reais no código, não só no censo |

⚠️ **TRÊS SEGREGAÇÕES DE FUNÇÃO VIRARAM GUARD, e não só crachá separado:** quem **mede** não
aprova a medição; quem **relata** a providência não a aprecia; quem **libera** a parcela não
aprova a prestação de contas. As duas primeiras recusam o **mesmo usuário** nas duas pontas.

⚠️ **O achado do art. 141 × art. 100.** A primeira versão reusava a justificativa de quebra de
ordem do art. 141 para o precatório — "o pagamento é um ato só, a razão dele é uma". **O
primeiro teste derrubou o argumento:** aquele campo exige uma `hipotese` de um **rol fechado
da Lei 14.133**, e nenhuma das cinco cobre acordo homologado nem sequestro de verba. Reusar
obrigaria o operador a declarar uma **hipótese falsa** para conseguir pagar — e a declaração
falsa ficaria gravada com a mesma aparência das verdadeiras. Hoje são dois campos.

### 16.5 · O percurso de navegador — 40 passos, 0 falhas, duas execuções

`scripts/smoke-ent03b.ts`, sobre os quatro cadastros. **Ele achou seis coisas**, e três eram
defeitos de verdade:

| O que o smoke achou | Era defeito? |
|---|---|
| **o campo de CPF/CNPJ aparecia SEM RÓTULO** | **sim.** `CampoCpfCnpj` é um campo nu, como o `CampoValor`, e ignorava o `rotulo` que o molde passava. Nenhum teste de módulo pegaria: o formulário funcionava, o valor chegava ao servidor, o registro gravava. **Faltava o rótulo** — quem usa leitor de tela ouviria "caixa de edição" e nada mais |
| as colunas derivadas não apareciam | **não** — a lista estava vazia e o molde mostrava o estado vazio, que é o certo. O teste é que conferia cedo demais |
| o histórico do convênio estava vazio | **não** — a glosa foi RECUSADA por falta de `RoteiroConvenio` no banco de dev, e a recusa está certa: as contas vêm por parâmetro |
| três marcadores não casavam | **não** — `innerText` devolve o texto **transformado pelo CSS**, e os rótulos são `uppercase` |

⚠️ **E o smoke provou pela tela o que mais importa:** repassar a consórcio **sem contrato de
rateio** é recusado **citando o art. 8º da Lei 11.107**, e nada fica gravado.

### 16.6 · PARTE 3 — a varredura do ENT04/ENT05, em bloco

`docs/varredura-de-modelo-ent04-ent05.md` — 543 cláusulas lidas, **treze decisões trazidas de
uma vez**, cada uma com a cláusula que a revela e a alternativa recomendada.

⚠️ **A varredura achou uma QUINTA família que ainda não tinha nome:** o documento pede
**CONFIGURÁVEL** e a implementação óbvia é **CONSTANTE**. Cinco cláusulas (margem consignável,
férias especiais, estorno de provisão na rescisão, obrigatoriedade do protocolo do atestado,
limite mínimo de estoque). É a armadilha do roteiro contábil num domínio novo, e o repositório
já tem a resposta: **nenhum código no código** — parâmetro em tabela, fail-closed.

**Os três alertas altos da família 3** (efeito antes da guarda):
- **5.12.60 — reintegração reutilizando a MESMA matrícula.** É a forma exata do `porNaFila`:
  gravar antes de conferir deixaria meio-vínculo e a reintegração **impossível para sempre**;
- **5.12.59 — simulação de rescisão.** "Não seja efetivamente executado" é promessa de
  ausência de efeito colateral, e promessas assim se quebram em silêncio;
- **5.19.38 — virada mensal da depreciação.** Lote sobre N bens: falhar no 300º deixa 299
  depreciados, e rodar de novo deprecia os 299 **outra vez**.

### 16.7 · Os regimes, declarados

| Entrega | Regime | Por quê |
|---|---|---|
| eixo de data civil (35 sítios) | **profundidade** | é razão contábil e guard: caracterização, mutação 11/11, fixture N=2, negação com motivo |
| convênios, precatórios, consórcios, medições | **profundidade** | movem o razão e têm teto próprio |
| controle interno | **superfície** | **não move o razão** — não há comportamento contábil anterior a caracterizar. Caso de uso + autorização + percurso de navegador |
| o molde e as telas | **superfície** | guarda do descritor, teste de autorização, um percurso por família de tela |

⚠️ **Nenhum rebaixamento de profundidade para superfície aconteceu neste lote.** O controle
interno nasceu em superfície porque é o regime certo para ele, não porque foi rebaixado.

### 16.8 · ⚠️ A MEDIÇÃO QUE FALHOU — 40, e a meta era 60 a 90

**O molde funcionou. A meta não foi atingida. As duas coisas são verdade, e o número explica:**

| | |
|---|---:|
| cláusulas marcadas neste lote | **40** |
| das quais vieram dos **4 cadastros novos** | **17** |
| das quais vieram de **medir o que já estava construído e nunca fora olhado** | **23** |
| densidade do catálogo | **~4 cláusulas por cadastro** |

⚠️ **A conta é essa: 4 cadastros × ~4 cláusulas = 17.** Para 60–90 num lote, o lote precisa de
**~15 cadastros pelo molde**. O que mudou é que isso **agora é possível** — os quatro
cadastros com listagem, formulário, detalhe de cinco abas e barra de ações custaram, juntos, o
que UM custava antes. O que não mudou é a densidade do catálogo, e ela não depende do método.

⚠️ **E 23 das 40 são uma segunda medição, sobre um segundo problema:** havia código testado e
verde que **nunca tinha sido olhado pelo catálogo** — dívida fundada, PPP, encerramento do
exercício, papel de runtime, campos adicionais, designer. Um instrumento que mede para baixo
esconde tanto quanto um que mede para cima.

### 16.9 · O que NÃO foi feito, e está nomeado

| Pendência | O que é |
|---|---|
| `ANEXO-DO-MOLDE-UI` | a aba de anexos **mostra**; o upload por ela ainda não foi ligado |
| `ROTEIROS-ENT03B-PARAMETRIZACAO` | o banco de dev não tem `RoteiroConvenio`/`Precatorio`/`Consorcio` — a tela recusa nomeando |
| `PPP-ANEXOS` / `PPP-VINCULO-EMPENHO` | `Anexo` e `Empenho` não têm coluna para PPP |
| `DIVIDA-PARCELAS` | não há modelo de parcela — sem o previsto, o comparativo previsto × pago é impossível |
| `AUDITORIA-EVENTOS` | sem modelo de evento, instaurar auditoria a partir dele não tem de onde partir |
| `AUDITORIA-SEM-EIXO-DE-REGISTRO` | `RegistroDeOperacao` guarda a AÇÃO e não o REGISTRO |
| `PRECATORIO-HIPOTESE-DE-QUEBRA` | o rol de hipóteses do art. 100 não está normatizado |
| `CHECKLIST-GRUPOS`, `RELATORIO-CIRCUNSTANCIADO-UI`, `CONVENIO-PAINEL-DE-ATRASO`, `PRECATORIO-RELATORIO`, `DIVIDA-RELATORIO`, `DIVIDA-RECLASSIFICACAO`, `AJUDA-DAS-TELAS-DO-MOLDE` | superfície e relatórios que faltam |
| `SELECAO-MULTIPLA-UI` | **saiu de graça no molde** — a soma da seleção é do servidor, em Decimal |
| `CONCILIACAO-PERIODO-PDF`, `ROL-DE-FONTES-UI` | ENT03c, por decisão da revisão |
| `DATA-CIVIL-APRESENTACAO`, `M07-FONTE-NO-MOVIMENTO` | registradas |
| `packages/integracao` | **ENT03c**, por decisão da revisão |

### 16.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Quando |
|---|---|---|
| `npm run test:tudo` | **180 arquivos, 1.830 testes, 0 falhas**, 699 s | 2026-09-11 |
| `npm run test:rapido` | **55 arquivos, 583 testes, 0 falhas**, 9,2 s | 2026-09-11 |
| `npx tsx scripts/mutacoes-eixo-de-data.ts` | **11 de 11 sítios PROVADOS** | 2026-09-11 |
| `scripts/smoke-ent03b.ts` | **40 passos, 0 falhas**, duas execuções | 2026-09-11 |
| `npm run typecheck` / `:app` / `:scripts` | 0 erros cada | 2026-09-11 |
| `npx next build` | limpo, com as 10 rotas novas | 2026-09-11 |
| `npx prisma migrate dev` | **3 migrations aditivas, ZERO `DROP`** (94 no total) | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **91 de 2037 (4,5%)**, +40 | 2026-09-11 |

⚠️ **UMA INTERMITÊNCIA, COM O MOTIVO JUNTO.** Numa execução em que `test:rapido` rodou
**encadeado com dois `tsc`** no mesmo shell (`typecheck && typecheck:scripts && test:rapido`),
**3 de 583 testes falharam** por timeout de 5 s — os que varrem disco. Em execução isolada,
verde duas vezes seguidas. **Causa: contenção de CPU numa máquina de 8 GB**, e não o código.
Registrado em vez de descartado.

⚠️ **Uma deriva de schema apareceu e foi fechada.** A primeira migration do ENT03b vinha
querendo **derrubar** `MovimentoBancario_fonteId_idx` — um índice que a migration do ENT03a
criou e que o modelo nunca declarou. É assim que a deriva se manifesta: não como erro, como
**remoção silenciosa** de um índice que o saldo por fonte usa. Declarado no schema, a deriva
acabou e a migration ficou com **zero `DROP`**.

---

## 17. ENT03c — o censo dos módulos existentes, três cadastros, e cinco tabelas mortas

⚠️ **A CONTAGEM DO LOTE, SEPARADA — porque foi essa separação que mostrou onde estava o ganho.**

| Origem | Cláusulas |
|---|---:|
| **CENSO** — medir o que já existia contra o catálogo | **220** |
| **CONSTRUÇÃO** — comportamento novo escrito neste lote | **0** |
| **Total do lote** | **220** |
| Catálogo | 91 → **311 de 2037 (15,3%)** |

⚠️ **E O ZERO DA SEGUNDA LINHA É O RESULTADO, não uma falha.** O ENT03b mediu que o
catálogo tem ~4 cláusulas por cadastro e concluiu que um lote de 60–90 precisaria de ~15
cadastros. O ENT03c testou a outra hipótese — **medir rende mais que construir** — e o
número é 220 contra 40. O molde do ENT03b continua sendo o que torna os cadastros baratos;
o que este lote mostra é que **a fila do que já existe e nunca foi olhado é maior do que a
fila do que falta construir**, e sai por uma fração do custo.

Os três cadastros entregues pelo molde (dívida fundada, dívida ativa, obras com medições)
**não acrescentaram cláusula nenhuma ao placar** — eles deram TELA ao que o censo tinha
acabado de marcar como `IMPLEMENTADO_NAO_VALIDADO`. Isso é honesto e está registrado: a
marcação deles subiria para `VALIDADO_LOCALMENTE` quando os roteiros contábeis estiverem
parametrizados nesta máquina (ver 17.6).

### 17.1 · Antes de tudo: a PROPRIEDADE, não o padrão

Duas vezes uma guarda procurou uma forma e achou só aquela forma. Este lote parou de
enumerar formas:

**A suíte inteira sob `Pacific/Kiritimati` (UTC+14) dá resultado IDÊNTICO ao de
`America/Sao_Paulo`** — 183 arquivos, 1.869 testes, 0 falhas nos dois fusos. `npm run
test:fuso` entrou no gate. ⚠️ E a descoberta anterior à execução importa: **`TZ` não estava
definido em lugar nenhum do repositório** — a suíte sempre rodou no fuso da máquina, que é
exatamente o `FUSO_DO_ENTE`. Todo `getFullYear()` do código estava acidentalmente certo.

**O padrão da fixture saiu do meio-dia para a HORA DE BORDA** (`test/instantes.ts`,
`DIA_DE_BORDA` = 22:00 civis). A linha trocada foi UMA — a dotação inicial de
`test/ficha-teste.ts`, que alcança quase toda a suíte. Ela acusou **o `c2`**, a
caracterização que existe para vigiar os dois eixos de data: a asserção lia
`competencia.toISOString().slice(0,10)` e dizia "2026-01-02". A competência civil continua
1º de janeiro; **quem estava em Greenwich era o teste** — dentro do próprio arquivo que
caracteriza o defeito.

⚠️ **AS DUAS ALAVANCAS PEGAM CLASSES DIFERENTES, e nenhuma pega a da outra:**

| | pega | não pega |
|---|---|---|
| **fuso deslocado** | quem lê o relógio do HOSPEDEIRO (`getFullYear()`, `toLocaleString` sem `timeZone`) | eixo UTC — está errado em qualquer máquina, de forma estável |
| **hora de borda** | quem lê o eixo UTC (`getUTCFullYear`, `Date.UTC`, ISO fatiado) | eixo do hospedeiro — nesta máquina ele acerta |

### 17.2 · `DATA-CIVIL-APRESENTACAO`: a pendência dizia ~10, a medição achou 57

Terceira vez consecutiva em que a estimativa de um padrão fica muito abaixo da medição
(foram 5→35 no ENT03b, e agora 10→57). **Cinco formas, e duas eram desconhecidas:**

1. `getUTC*` — leitura por UTC;
2. `toISOString().slice(0,10)` — impressão por UTC;
3. `new Date(Date.UTC(...))` — construção de janela por UTC (a do ENT03b);
4. **`toLocaleString("pt-BR")` sem `timeZone`** — o relógio de QUEM RENDERIZA. Em componente
   de servidor, isso é a **máquina**. Oito telas imprimiam instante assim;
5. **`` new Date(`${dia}T23:59:59.999Z`) ``** — a mais traiçoeira, porque *parece*
   deliberada: hora escrita à mão, com milissegundos, como quem sabe o que faz. E 23:59:59Z
   é 20:59:59 no ente — o corte perde as três últimas horas do dia.

O que a varredura achou, nomeado:

- **`dataBr` de `lib/recorte.ts`** — o formatador que quase toda tela usa — **imprimia por
  UTC**. Um fato de 31/12 às 22:00 saía "01/01", no ano seguinte;
- **treze sítios da BORDA DE ESCRITA** (empenho, liquidação, pagamento, ordem, arrecadação,
  crédito adicional, movimentação bancária) ancoravam a data do fato em `T12:00:00Z` — que é
  meio-dia em **Greenwich**. O dia civil saía certo, mas por uma régua diferente da do resto
  do sistema, e "certo por outra régua" é como as cinco formas nasceram, uma a uma. Virou
  `meioDiaCivil` em `packages/datas`;
- a **competência da remessa SAGRES** era normalizada pelo último dia do mês em UTC — que no
  horário de verão cai às 21:00 do penúltimo dia do ente, e o pacote mensal perderia o último
  dia inteiro.

A guarda `data-civil.test.ts` **cresceu de escopo** (agora varre `app/`, `lib/` e
`components/`, além do domínio) e **de padrão** (as cinco formas). Provada por mutação:
reintroduzir `new Date().getFullYear()` numa tela faz o teste acusar o arquivo e a linha.

### 17.3 · `M07-FONTE-NO-MOVIMENTO`: o defeito era pior que a pendência

A pendência dizia "o movimento extraorçamentário não tem fonte, então o saldo por fonte tem
um balde `(sem fonte declarada)`" — o que descreve um buraco **honesto**, visível na tela.

⚠️ **A medição achou outra coisa.** `extraorcamentarioPorFonte` atribuía **todos** os
movimentos à fonte PADRÃO da conta bancária. Numa conta de fonte única isso acerta por
coincidência; mas desde o ADR de 2026-09-10 uma conta admite um **rol** de fontes (TR
5.10.2.6). Numa conta multifonte, a fonte padrão é um **palpite** — e o palpite estava no
número que existe para provar que recurso vinculado não custeou outra coisa.

Pior: **o dispêndio já conferia a fonte contra o rol e não a gravava.** Conferir e esquecer
é o pior dos dois mundos — o guard roda, o operador declara a fonte certa, o dado se perde,
e a consulta responde pela conta de novo.

Fechado: `MovimentoExtraorcamentario.fonteId` (nullable, porque os movimentos antigos não
têm como saber — preenchê-los seria escrever a invenção no banco), o ingresso passou a
**exigir e conferir** a fonte contra o rol, o estorno **herda** a do original, e a consulta
lê a do movimento. **Provado por mutação**: com a atribuição antiga, o teste novo acusa
`10.000,00` na fonte livre e **nada** no FUNDEB — 7.000 de dinheiro vinculado contados como
livre.

### 17.4 · O censo — e o que ele diz sobre "BASE_FORTE"

Nove seções varridas contra M01–M22. ⚠️ **O achado estrutural: "BASE_FORTE" no mapa de
lacunas significa "existe um arquivo com esse nome"** — e o próprio mapa avisa isso. Medido
cláusula a cláusula, o M10 se parte em dois:

- **o almoxarifado é CONTÁBIL, não FÍSICO.** Move VALOR por classe de material contra a
  conta de estoque do PCASP. **Não há quantidade** — logo não há preço médio, saldo mínimo,
  inventário, depósito, lote nem validade. **20 das 25 cláusulas da 5.18 são
  `AUSENTE_CONFIRMADO`**, numa seção que o mapa classificava como base forte;
- **o patrimônio é a CONTABILIDADE do bem, não a GESTÃO dele.** Tombamento, classe, valor
  contábil, depreciação por competência (NBC TSP 07, os três métodos do MCASP) e alienação
  com resultado — tudo provado. Não há localização, responsável, estado de conservação,
  comissão, termo nem etiqueta;
- **o M11 tem o PROCESSO e o CONTRATO; não tem a COMPRA.** A cadeia processo → homologação →
  contrato → aditivo → empenho → liquidação → medição é das partes mais bem provadas do
  repositório. Produto, proposta, lance, comissão, fornecedor, ordem de compra, ata de
  registro de preços, plano anual e pesquisa de preços: nenhum tem modelo.

Nos três casos **o motor é bom e está provado; o que falta é o cadastro que o alimenta.** É
a diferença entre "ampliar o que existe" e "construir o que falta", e ela muda o custo do
próximo lote.

Achados nomeados durante a varredura:

- **`ProcessoLicitatorio.modalidade` é NOT NULL** — a 5.17.16 ("digitar o processo sem
  modalidade e escolhê-la após o parecer jurídico") é **impedimento de modelo**, não tela que
  falta;
- **o motor de workflow EXISTE — no M21.** Roteiro copiado na abertura, etapa com setor e
  prazo, situação derivada dos movimentos, prazo contado do recebimento, tramitação só para
  quem é lotado no setor. A licitação simplesmente **não está ligada a ele**. Por isso a
  5.17.17 é `PARCIAL` e não `AUSENTE`;
- **o leiaute do TCM-BA pede o número do SUBEMPENHO** e o gerador repete o do empenho, porque
  subempenho não existe no modelo. A remessa declara um conceito que o sistema não tem.

### 17.5 · ⚠️ CINCO TABELAS MORTAS — e o guard que agora as vigia

`ParecerContrato` e `CertidaoFornecedor` estão no schema, com os tipos certos, migration
aplicada — e **nenhuma linha de código escrita à mão as lê ou escreve**. As 57 ocorrências
dos dois nomes estão todas em `prisma/generated/`.

⚠️ **É o modo de falha mais perigoso deste inventário: a tabela PARECE atendimento.** Quem
abre o schema perguntando "o sistema registra parecer jurídico?" acha `ParecerContrato` com
`JURIDICO`, `TECNICO`, `CONTROLE_INTERNO` e `CONTABIL`, e conclui que sim. É literalmente a
regra do prompt — *"código que existe não é comportamento provado"* — acontecendo.

Virou guard permanente: `test/modelo-sem-caso-de-uso.test.ts`. E quando ele ficou **correto**
achou mais três: `TipoLancamentoReceitaSagres`, `DeParaContaSiga` e `DeParaFonteSiga`.

⚠️ **O guard errou duas vezes antes de acertar, e as duas lições ficaram no código:**

1. **prosa não é código.** Ele ficava verde sozinho e vermelho na suíte completa — e quem o
   acusava era a **evidência do próprio catálogo**, que explica em português que
   `ParecerContrato` é tabela sem caso de uso. Um nome citado dentro de uma string é
   documentação, exatamente como dentro de um comentário (`test/prosa.ts`);
2. **delimitador aninhado é gramática, não padrão.** A primeira versão do removedor de
   literais era regex, e um backtick dentro de uma string comum fazia o padrão engolir
   centenas de linhas — **vinte modelos legítimos apareceram como órfãos**. Virou varredor de
   caracteres;
3. e a tentação que foi recusada: aceitar o **nome do campo de relação** como prova de uso.
   Não serve — `pareceres` aparece quatro vezes no repositório e **nenhuma** é de
   `ParecerContrato`; são os pareceres do PROCESSO, no M21. A dedução por nome de campo teria
   escondido justamente o achado.

### 17.6 · Os três cadastros pelo molde — e o que o navegador provou

Dívida fundada, dívida ativa e obras com medições: **os três saíram do próprio censo**, com
o mesmo padrão — caso de uso completo, invariante provado, e nenhuma rota em `app/`.

⚠️ **NENHUM DELES PRECISOU DE AÇÃO NOVA NO CENSO DO M16.** As doze ações que as telas
disparam já existiam desde que os casos de uso nasceram. É a medida mais honesta do custo do
molde: **três descritores, nove rotas, uma migration aditiva de duas colunas.**

Smoke: **34 passos, 0 falhas, duas execuções** (`scripts/smoke-ent03c.ts`).

⚠️ **E ELE ACHOU DUAS COISAS.** A primeira execução teve 3 falhas, todas com a **mesma
causa, e a causa não é defeito**: esta máquina não tem `RoteiroDivida` nem
`RoteiroDividaAtiva` parametrizados, e o caso de uso **recusa fail-closed** — *"as contas do
PCASP vêm por PARÂMETRO — nenhuma conta é inventada no código"*. O PCASP semeado aqui é o
mínimo da POC (26 contas analíticas, sem a VPD de variação monetária). **Fabricar um código
de conta para o smoke passar seria inventar norma da STN dentro de um teste** — não foi
feito. Pendência `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`.

A segunda foi pior e mais útil: **um passo passava pelo motivo errado.** A asserção "a
correção aparece no histórico" procurava `"atualização monetária"` no texto da página — e
esse é o **rótulo** de uma linha do painel de dados, que aparece com ou sem movimento. Mesma
classe de falso-verde do ENT03b. Hoje a asserção é sobre a **aba de histórico** e prova o
oposto: que a recusa **não deixou movimento órfão**.

### 17.7 · `prisma migrate diff` no gate

`npm run deriva` monta um banco de sombra, aplica migrations + `prisma/sql/`, e separa duas
perguntas: **migrations × modelo** tem de ser vazio; **banco completo × modelo** só pode
conter os objetos que `prisma/sql/` cria de propósito (a lista é lida dos arquivos, não
escrita à mão). **Provado por mutação**: removida uma linha `@@index` do schema, ele produz
exatamente o `DROP INDEX` da deriva do ENT03b.

⚠️ E ele **quebrou o `prisma validate` de todo mundo** na primeira versão, porque `env()`
do Prisma **lança** quando a variável não existe, em vez de devolver indefinido. A chave do
banco de sombra hoje só existe quando a variável existe.

### 17.8 · Os regimes, declarados

| Entrega | Regime | Por quê |
|---|---|---|
| `DATA-CIVIL-APRESENTACAO`, `M07-FONTE-NO-MOVIMENTO` | **profundidade** | eixo de data e saldo por fonte: caracterização, teste de negação afirmando o motivo, e **mutação provada** nos dois |
| prova de fuso, hora de borda, `deriva`, guards de censo | **profundidade** | são guards; um guard não provado por mutação é uma rede com buraco |
| censo das 9 seções | **superfície** | teste de caso de uso e de autorização, sem caracterização nova — é medição do que já roda há meses |
| 3 cadastros pelo molde | **superfície** | percurso de navegador por família de tela, sem tripwire mutado |

Nenhum rebaixamento de profundidade para superfície neste lote.

### 17.9 · O que NÃO foi feito, e está nomeado

- `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS` — dívida fundada e dívida ativa só movimentam
  depois que o ente parametrizar o roteiro. **E há um achado de superfície junto**: a tela
  oferece a ação e o operador só descobre a falta depois de preencher o formulário inteiro;
- `SCHEMA-SEM-CASO-DE-USO` — as cinco tabelas mortas: escrever o caso de uso ou remover;
- `SUBEMPENHO-NO-LEIAUTE-TCM-BA` — a remessa pede o que o modelo não tem;
- `LICITACAO-SEM-WORKFLOW` — o motor do M21 existe e a licitação não o usa; falta a FK;
- as demais pendências do ENT03b seguem de pé, e `packages/integracao` e o **planejamento**
  continuam fora de escopo por decisão, agora para o **ENT03d**;
- **o lote de tenancy** segue de pé desde o ENT01 — e o censo o encontrou de novo: 5.17.34
  (licitação multientidade) e 5.19.27/5.19.28 (patrimônio por unidade gestora, transferência
  entre entidades) **dependem dele**, não de tela.

### 17.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` | **183 arquivos, 1.869 testes, 0 falhas, 638 s** | 2026-09-11 |
| `npm run test:fuso` (`Pacific/Kiritimati`) | **183 arquivos, 1.869 testes, 0 falhas** — idêntico | 2026-09-11 |

⚠️ **UMA INTERMITÊNCIA, REGISTRADA COM O QUE SE SABE E SEM O QUE NÃO SE SABE.** A execução
do `test:fuso` das **01:22 de 2026-09-11** acusou **2 falhas em 1.869**. Duas execuções
seguintes do MESMO comando, no MESMO commit, deram **0 falhas** — e uma delas com o
`next start -p 3011` do smoke ainda de pé, que é a configuração mais carregada das três.
Máquina de 8 GB, suíte serializada contra um banco só.

⚠️ **E O QUE FALTA AQUI É CULPA DA MINHA FERRAMENTA, NÃO DO TESTE: os nomes dos dois testes
que falharam NÃO foram capturados.** O comando canalizava a saída por um `grep` que descartou
o bloco de falhas antes de ele chegar ao arquivo. Uma intermitência sem o nome do teste é
quase inútil — ela não se investiga e não se reproduz. As execuções seguintes passaram a
gravar o log inteiro em arquivo e só depois filtrar. **A causa da falha segue não isolada**,
e está aqui por isso: descartá-la em silêncio seria exatamente o que a regra do lote proíbe.
| `npm run test:rapido` | 583 testes, 0 falhas, ~9 s | 2026-09-11 |
| `npm run deriva` | migrations × modelo limpo; 24 objetos de `prisma/sql/` | 2026-09-11 |
| `npx tsx scripts/smoke-ent03c.ts` | **34 passos, 0 falhas** — duas execuções | 2026-09-11 |
| `npx tsc` (backend, app, scripts) | 0 erros nos três | 2026-09-11 |
| `npx next build` | limpo; as 9 rotas novas na tabela | 2026-09-11 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **787 de 787 cobertos, 0 descobertos** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **311 de 2037 (15,3%)** | 2026-09-11 |

## 18. ENT04 — os seeds oficiais, a casca e o que a medição disse

⚠️ **Este lote entregou os quatro itens pedidos e marcou 5 cláusulas.** A distância entre
as duas frases é o achado principal, e ela está medida em 18.9.

### 18.1 · A contagem do lote, separada

| | |
|---|---:|
| **censo** — medir o que já existia | **0** |
| **construção** — comportamento novo com cláusula | **5** |
| **acréscimo de produto SEM cláusula** (fora da contagem, por decisão) | 6 frentes |
| catálogo | 311 → **316 de 2037 (15,5%)** |

Promoções (não somam ao total, porque já estavam verificadas): **5.10.1.82** e **5.34.25**
de `IMPLEMENTADO_NAO_VALIDADO` para **`VALIDADO_LOCALMENTE`**, pelo smoke.

**Os acréscimos de produto sem cláusula**, registrados fora da medida para não diluí-la:
barra lateral filtrada por permissão; busca global; painel de pendências do usuário;
portão executável; registro bruto de execução; cadastro de **provisões** pelo molde.

### 18.2 · ⚠️ O ITEM 1 virou o achado do lote: o plano de contas estava no lugar errado

`docs/oficial/tce-pb/Pcasp_2025.xlsx` — publicado pelo TCE-PB, sha256 conferido contra o
`MANIFEST.json` **antes de qualquer leitura** — entrou no sistema: **7.864 contas**, com
nome, natureza de saldo, nível e hierarquia. `npm run seed:pcasp-oficial`.

Confrontados os **70** códigos PCASP que o código de produção usa contra a tabela real:

- **ZERO inventados.** Todos existem no plano publicado. Nenhum lote anterior fabricou
  código de conta — a disciplina segurou, e isso agora é teste
  (`test/contas-contra-o-plano-oficial.test.ts`).
- **E quatro estão no lugar errado**, o que só o confronto de NOME revela:

| O sistema chama de | No PCASP é |
|---|---|
| `1.1.1.1.2.00.00` "Bancos Conta Movimento" | **CAIXA E EQUIVALENTES… - INTRA OFSS** (a variante para transações entre entes do mesmo OFSS). O banco do município é `1.1.1.1.1.19.00` |
| `1.1.5.1.1.00.00` "Almoxarifado" | **MERCADORIAS PARA REVENDA OU DOAÇÃO**. Almoxarifado é `1.1.5.6.x` |
| `2.2.1.1.1.00.00` "Dívida Fundada Interna" | **PESSOAL A PAGAR - CONSOLIDAÇÃO**. A dívida fundada é `2.2.2.x` |
| `1.1.2.2.x` "Créditos Tributários a Receber" | **CLIENTES** |

E `6.2.1.2.0.00.00` RECEITA REALIZADA estava semeada como **DEVEDORA**; a classe 6 é
credora e a conta não é retificadora. O seed oficial corrigiu essa, que é de dado.

⚠️ **AS OUTRAS QUATRO NÃO FORAM CORRIGIDAS NESTE LOTE, E É DECISÃO.** Trocar a conta de um
roteiro muda **lançamento já gravado**: o saldo migra de conta sem que exista movimento
explicando a migração, e dois exercícios deixam de fechar entre si. É correção de eixo do
mesmo peso que a do eixo de data, e como aquela precisa de **caracterização antes** — o que
cada conta hoje acumula, e para onde cada saldo vai. Pendência
**`PLANO-DE-CONTAS-FORA-DO-PCASP`**. O guard mantém a lista visível e **falha se ela
crescer**.

### 18.3 · ⚠️ O plano oficial quebrou um formulário, e o defeito não era um erro

Com 6.074 contas analíticas no banco, `opcoesDoCadastro` — que pedia "todas as analíticas"
com `take: 500` — passou a trazer **só a classe 1**, porque são as 500 primeiras por
código. O campo "Conta do passivo" da dívida fundada ficou **sem nenhuma conta de passivo**.

Nada estourou. O formulário montou, o `select` apareceu, e não havia o que escolher.
**Lista curta não é exceção: é um formulário bonito e inútil.**

A correção é declarativa, não um teto maior: o descritor diz **quais classes** o campo
aceita (`classesDeConta`), `verificarDefinicao` **cobra** a declaração, e a consulta filtra
por elas. Teto maior adiaria o mesmo defeito para o dia em que o plano crescesse — e ainda
mandaria 400 KB de `<option>` ao navegador. `test/molde/opcoes-de-conta.test.ts`.

### 18.4 · Os roteiros, e a linha entre fato e escolha

`npm run seed:roteiros-patrimoniais` parametrizou **16 roteiros** — 8 de dívida ativa, 2 de
dívida fundada, 6 de provisão — e o smoke do ENT03c, que provava a **recusa**, agora prova
a **aceitação**. Fecha `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`.

⚠️ **A distinção está escrita no próprio seed, e importa mais que o resultado.** **Fato:**
todo código existe no PCASP oficial, é **analítico**, e o seed **recusa rodar** se algum
deixar de existir ou de ser analítico. **Escolha:** qual par débito/crédito corresponde a
cada evento é doutrina do MCASP, não dado do arquivo do TCE — está explicada linha a linha,
e **é do contador do ente**. O seed a torna explícita e revisável num lugar só.

### 18.5 · O menu não pode oferecer o que o servidor nega

A barra lateral mostrava as **18 áreas** a todos. Agora a visibilidade vem do **mesmo**
`PermissaoDePerfil` que o `autorizar` lê — sem lista paralela.

⚠️ **A exaustividade é do compilador, não da boa vontade:**
`Record<AcaoDoSistema, SlugDeArea | "transversal">` obriga uma entrada para cada uma das
**185** ações do censo. Ação nova não compila até dizer onde mora.

E o teste é de **propriedade**, não de lista: *área escondida ⟺ o servidor nega TODAS as
ações dela* — percorrendo as 185 ações contra o `autorizar` de verdade. Mutação: fazendo o
menu mostrar tudo, ele acusa nominalmente ("Planejamento APARECE no menu e o servidor nega
TODAS as suas ações"). `test/menu-contra-o-servidor.test.ts`.

⚠️ **E o que ele NÃO resolve está dito:** o censo do M16 cobre **mutações**; leitura ainda
não é permissão. Por isso `transparencia` — só leitura — fica visível a qualquer sessão.
Isso não é o menu mentindo: é o menu dizendo a verdade sobre um servidor que ali não nega.

### 18.6 · Busca, pendências e o que ficou de fora por honestidade

**Busca global**: índice **derivado** de `RECURSOS_DO_MOLDE`, `AREAS` e das listas de
navegação — o cadastro do próximo lote entra sozinho. O recorte de permissão é feito **no
servidor**; o cliente só casa texto. Um destino com ação exige **aquela** ação: quem pode
lançar consórcio não recebe "Convênios" como se fosse atalho autorizado.
⚠️ Ela **não busca dado** (o convênio nº 12/2026): isso exige o recorte de unidade gestora
de cada consulta, e ignorá-lo vazaria títulos de registros por lista de resultados.
Pendência **`BUSCA-DE-REGISTRO`**.

**Painel de pendências**: assinaturas na fila, pareceres aguardando você, conciliações em
aberto — três contagens sobre registro existente, cada uma com o critério em português na
tela. **"Pendente" é derivado da ausência do fato** (o signatário sem assinatura, o pedido
de parecer sem resposta), nunca de coluna de estado. **A faixa some quando não há nada** —
três zeros no topo ensinam o operador a não olhar para ali.

⚠️ **"Prazos próximos" NÃO foi entregue.** O prazo mora na etapa do roteiro do assunto
(M21) e exige a contagem por dia útil a partir do RECEBIMENTO, não do trâmite. Um painel
com prazo aproximado é pior que nenhum. Pendência **`PAINEL-DE-PRAZOS`**.

### 18.7 · A ferramenta que perdeu os nomes

`stdio: "inherit"` era a causa: o filho escrevia direto no terminal do chamador, e um
`| grep` destruía a saída para sempre. Agora o runner **grava em disco antes** de qualquer
cano, e só depois filtra — e o resumo do que falhou sai por `stderr`, porque por `stdout`
o mesmo `grep` esconderia a pista.

**Provado reproduzindo o ENT03c:** um teste falhando, `2>/dev/null | grep Duration` — o
terminal ficou só com a duração, e o nome `NOME-QUE-NAO-PODE-SE-PERDER` estava intacto no
arquivo. `test/registro-de-execucao.test.ts` fixa a propriedade.

⚠️ **E ela já pagou num caso real, não num fixture:** a primeira execução do portão caiu, e
o nome do teste responsável estava gravado. O defeito era do próprio trinco — 18.11.

### 18.8 · O portão, e o guard de tabela morta

O "gate" era uma **tabela em documento**: nove comandos para alguém lembrar de rodar, na
ordem certa, e transcrever. Virou `npm run portao` — dez passos, saída bruta por passo,
e **não para no primeiro erro** (só pula o que depende do que caiu, e diz que pulou).
Ele também **nomeia o que não roda**: o smoke de navegador e a instalação real.

O guard de tabela morta **já era do schema inteiro** (189 modelos). Medido e provado por
mutação: um modelo novo sem leitor é acusado pelo nome. O que faltava era o gate, e é o
que o portão dá.

### 18.9 · ⚠️ O GARGALO, nomeado — porque a meta era 60–90 e vieram 5

Não é o molde, e não é o censo. É **o desencontro entre o que tem motor e o que o catálogo
pede**, e este lote o mediu nas duas direções:

1. **Os quatro itens do ENT04 são infraestrutura.** Seeds oficiais, casca, guards e
   ferramenta quase não têm cláusula: o catálogo descreve **funcionalidade de negócio**.
   Foi o lote certo a fazer — sem os seeds nenhum percurso demonstrava — e ele rende pouco
   em contagem por natureza, não por execução.
2. **O cadastro de PROVISÕES, entregue pelo molde e provado pelo smoke, marcou ZERO.** As
   oito cláusulas que dizem "provisão" são **todas de folha** (férias, 13º, licença-prêmio,
   seção 5.12). A provisão **contábil** do M10 — matemática previdenciária e riscos — não é
   pedida em cláusula nenhuma. Buscas por "atuarial", "riscos fiscais", "passivo
   contingente" e "NBC TSP" no catálogo: 1, 0, 0 e 0.
3. **É a segunda vez seguida.** No ENT03c, os três cadastros do molde também somaram zero —
   deram *tela* ao que o censo acabara de marcar `IMPLEMENTADO_NAO_VALIDADO`.

**A conclusão, medida:** os motores que existem sem tela (dívida, provisões) quase não
aparecem no catálogo; e as **469 cláusulas** de `BASE_FORTE` estão em módulos cujo motor o
censo do ENT03c mostrou que **não existe** — almoxarifado físico, gestão patrimonial,
compras. Construir tela para motor pronto rende ~0; construir motor rende muito e custa
caro.

⚠️ **Por isso o próximo lote não deve começar pelo molde.** Ele deve começar pelo **modelo**
das três seções derrubadas — quantidade no almoxarifado, responsável/localização no bem,
requisição e ordem de compra — que é onde as 469 cláusulas moram. O molde entra **depois**,
e aí rende.

### 18.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao` | **10 de 10 passos**, na terceira execução — as duas primeiras vermelhas por um defeito que ele mesmo pegou; passo a passo em 18.11 | 2026-09-11 |
| `npx tsx scripts/smoke-ent03c.ts` | **41 passos, 0 falhas — DUAS execuções**, a segunda contra o banco já povoado pela primeira | 2026-09-11 |
| `npm run seed:pcasp-oficial` | 7.864 contas; 7.800 criadas; 1 natureza corrigida; 12 divergências de `analitica` **relatadas e não alteradas** | 2026-09-11 |
| `npm run seed:roteiros-patrimoniais` | 8 + 2 + 6 roteiros | 2026-09-11 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **809 de 809 cobertos, 0 descobertos** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **316 de 2037 (15,5%)** | 2026-09-11 |

⚠️ **A intermitência do ENT03c continua sem isolamento** — 2 falhas em 1.869 numa execução
do `test:fuso`, nomes perdidos pelo `grep`. **Ela não pode mais acontecer** (18.7), mas
também não foi reproduzida: o `test:fuso` deste lote rodou **1.912 testes sob
`Pacific/Kiritimati` com 0 falhas** (18.11). Fica registrada como não isolada, e não como
resolvida — uma execução limpa não refuta uma intermitência.

### 18.11 · O portão, rodado — e o que ele pegou na primeira tentativa

`npm run portao`, **2026-09-11**, TZ do hospedeiro `America/Recife`, Node v20.20.0.
**Três execuções: as duas primeiras vermelhas, a terceira 10 de 10.**

| Passo | Resultado | Tempo |
|---|---|---|
| `typecheck:backend` | limpo | 18s |
| `typecheck:app` | limpo | 3s |
| `typecheck:scripts` | limpo | 2s |
| `cobertura-de-tsconfig` | **809 de 809 cobertos, 0 descobertos** | 6s |
| `prisma:validate` | limpo | 1s |
| `deriva` | migrations x modelo limpo; banco x modelo só os **24 objetos** de `prisma/sql/` | 12s |
| `test:rapido` | **62 arquivos, 656 testes, 0 falhas** | 12s |
| `test:tudo` | **189 arquivos, 1.912 testes, 0 falhas** | 430s |
| `test:fuso` | **189 arquivos, 1.912 testes, 0 falhas**, sob `Pacific/Kiritimati` | 459s |
| `build` | compilou; 21 páginas estáticas | 38s |

**Código de saída medido, não suposto:** a cadeia inteira
(`npm` → `tsx` → trinco → `npx` → `tsx`) devolve o código do filho — filho com `exit 5`
devolveu **5**. Um wrapper que engolisse isso faria um gate vermelho se anunciar verde, e
é uma coisa que se mede, não se assume.

⚠️ **E o portão pegou um defeito logo na primeira tentativa — meu, e no lugar mais
constrangedor possível: dentro da ferramenta do ITEM 4.**

`test/registro-de-execucao.test.ts` roda o próprio trinco como filho para provar que a
saída bruta chega ao disco. **Sozinho ele passava (656/656); dentro do portão falhava
sempre** — 1 falha em 656 e 1 em 1.912, o mesmo arquivo, com o `test:fuso` pulado por
dependência. O portão rodava sob o trinco, o trinco aninhado encontrava o dono vivo, e
recusava. O filho saía com código 1 em vez do 3 que o script pediu.

**O defeito não era do teste.** O trinco conta **máquina**, não processo: quando o dono é um
ancestral, a memória já está contabilizada por ele, e recusar ali não protegia nada — só
impedia que qualquer trabalho pesado invocasse a si mesmo. Era uma armadilha latente para
qualquer passo futuro do portão que chamasse um comando com trinco.

A correção é **reentrância por descendência**: quem toma o trinco exporta o próprio PID em
`TRINCO_DE_MAQUINA_DONO`, e todo descendente herda pelo `spawn`. Não é dispensa — a
variável só vale se apontar para o PID **que de fato detém o trinco agora** e que ainda
está **vivo**; herança de shell antigo ou valor inventado é recusada como qualquer outro.
O aninhado também **não toma e não libera** o trinco: se tomasse, o soltaria ao sair e
devolveria a máquina no meio do trabalho do ancestral — o estado exato que o trinco existe
para impedir.

**Provado por mutação, nas duas metades** — cada uma mata exatamente um teste, e só um:

| Mutação em `travarAMaquina` | Teste que morre |
|---|---|
| `dono.pid === herdado` → `false` | o descendente do dono passa — e NÃO fica com o trinco na mão |
| `dono.pid === herdado` → `true` | dono FORJADO não abre o trinco alheio |

⚠️ **O que a reentrância NÃO protege, dito em voz alta:** um trabalho pesado que dispare
outro **em paralelo consigo mesmo** passa agora. Nada no repositório faz isso — os passos
do portão são sequenciais — e o dia em que alguém fizer, é esta linha a reler.

⚠️ **A segunda execução também custou uma lição de método:** a primeira rodada do portão
acusou `test:rapido` falhando e **o arquivo de registro do passo não existia**. Causa:
`spawnSync` bloqueia o event loop, e as escritas assíncronas de `createWriteStream` ficavam
enfileiradas esperando um loop que só voltava a girar no fim. É a mesma classe de defeito
que o ITEM 4 existe para impedir — saída que não chega ao disco — reaparecida **dentro da
ferramenta construída para impedi-la**. `scripts/portao.ts` passou a escrever com
`writeFileSync`/`appendFileSync`.

## 20. ENT05 — o modelo das três seções derrubadas

### 20.1 · A contagem do lote, por natureza

⚠️ **A META VEIO DECLARADA POR NATUREZA, e a medida tem de acompanhar.** Este foi lote de
**modelo e superfície**, com meta de 80 a 120. O que ele entregou:

| | |
|---|---:|
| **construção — cláusulas que saíram de `AUSENTE_CONFIRMADO`** | **50** |
| **construção — cláusulas que saíram de `PARCIAL`** | **4** |
| **total promovido para `IMPLEMENTADO_NAO_VALIDADO`** | **54** |
| **censo** — medir o que já existia | 0 |
| **acréscimo de produto SEM cláusula** (fora da contagem) | 3 frentes |
| catálogo | **316 de 2037 (15,5%) — e o percentual NÃO se move** |

⚠️ **POR QUE O PERCENTUAL NÃO SE MOVE, E POR QUE ISSO NÃO É ESTAGNAÇÃO.** As 184 cláusulas
destas três seções **já estavam contadas** pelo censo do ENT03c — com veredito negativo. O
que mudou não foi *quantas* foram olhadas: foi *o que se vê nelas*. Nas três seções:

```
AUSENTE_CONFIRMADO        146  ->   96     (−50)
PARCIAL                    31  ->   27     (−4)
IMPLEMENTADO_NAO_VALIDADO   7  ->   61     (+54)
```

**A medida deste lote é a segunda linha, não a primeira.** Um lote que constrói sobre
seção já censada move situação, não cobertura — e confundir as duas faria o próximo lote
achar que não avançou.

⚠️ **E NENHUMA ENTROU COMO `VALIDADO_LOCALMENTE`.** Todas têm modelo, caso de uso e teste
contra banco; **nenhuma tem tela**. O ITEM 2 (superfície pelo molde) NÃO foi executado — e
chamá-las de validadas seria dizer que um servidor municipal consegue usá-las hoje. Ele não
consegue. Ver 20.8.

**Os acréscimos de produto sem cláusula**, fora da medida: o repontamento de conta
(`repontarConta` + `MigracaoDeConta`), a reentrância do trinco de máquina, e a segunda
direção do censo de ausências (`CONQUISTAS`).

### 20.2 · A varredura, antes de modelar — e o que a rede NÃO pegou

`docs/varredura-ent05-tres-secoes.md` procurou as cinco famílias por assinatura nas 184
cláusulas e leu os achados um a um. **Catorze decisões (D1 a D14), todas de uma vez.**

⚠️ **TRÊS DAS CATORZE A REDE NÃO PEGOU**, e são o motivo de a leitura não poder ser
dispensada:

- **D6** — a 5.17.2 pede "relacionar **uma ou mais** unidades de medida" no fim de uma
  cláusula longa sobre descrição. É literal, e um `unidadeId` no material quebra no
  primeiro material comprado em caixa e distribuído em unidade;
- **D7** — marcas pré-aprovadas e elementos de despesa, as duas N-N, e a 5.17.9 pede uma
  **guarda**, não um enfeite ("impedindo que determinado produto seja comprado com
  elemento errado");
- **D14** — bloqueio de estoque como **fato com início e fim**, não flag. Um
  `bloqueado Boolean` responde "agora" e perde quem bloqueou, quando e por quê.

E **uma das que a rede pegou não muda nada** (D9): a 5.17.67 pede que NÃO se multipliquem
modelos de edital — é o inverso da família de cardinalidade. Ficou registrada para não ser
reaberta.

### 20.3 · ⚠️ O ALMOXARIFADO FÍSICO — e a cláusula que refuta a coluna na própria seção

A 5.18.1 pede "atualização automática do estoque", que é a formulação exata de uma COLUNA
de saldo. **A 5.18.16, quinze linhas abaixo, pede o saldo ANTERIOR ao período** — que
coluna nenhuma sabe responder.

A posição é `Σ(quantidade × sinal)` e `Σ(valor × sinal)` **até uma data civil**. O preço
médio sai da mesma janela, e o preço **efetivamente aplicado** é gravado no movimento de
saída, porque é fato.

⚠️ **N = 2 É O QUE PROVA O PREÇO MÉDIO.** Com uma entrada só, "média" e "preço da última
entrada" dão o mesmo número e qualquer implementação errada passa. Com 100 a R$ 5,00 e
100 a R$ 9,00, a saída sai a **7,00** — e não a 9,00.

⚠️ **E ESTOQUE ZERADO RECUSA, em vez de devolver zero.** Custo zero atravessaria o razão
sem acusar nada.

### 20.4 · ⚠️ O DEFEITO QUE O TESTE DE VALIDADE PEGOU, E ELE ERA MEU

A primeira versão exigia lote só na ENTRADA. O teste da 5.18.14 consumiu um lote inteiro de
dipirona e ele **continuou aparecendo em "a vencer"** — porque a saída não apontava para
lote nenhum, e a posição POR LOTE nunca baixava.

O efeito real: o relatório da 5.18.20 mandaria alguém procurar na prateleira um medicamento
já distribuído — e, pior, esconderia que o lote que AINDA está lá é outro, com outra
validade. Agora a saída de material com controle de lote **exige o lote**, confere que ele é
daquele material e daquele depósito, e recusa se não houver saldo nele.

⚠️ **E A TRANSFERÊNCIA DE MATERIAL COM LOTE RECUSA**, em vez de errar em silêncio: levar o
lote para o outro depósito exige abrir o lote correspondente lá, preservando a validade.
Pendência `TRANSFERENCIA-DE-MATERIAL-COM-LOTE`.

### 20.5 · O PATRIMÔNIO COMO GESTÃO — o parêntese que é um eixo temporal

> **5.19.20** — "informando seu estado e localização **atual (no momento do inventário)**"

O parêntese é um eixo temporal escrito por extenso. Situação, estado e localização são
**derivados do último movimento de cada tipo até uma data** — nenhuma coluna `atual`.

⚠️ **O ESTORNO ANULA, e não é "mais um movimento no fim da fila".** A leitura remove os
pares (original, estorno) ANTES de procurar o último de cada tipo. Tratá-lo como movimento
comum faria a localização do bem voltar a ser a que o estorno desfez — o contrário do que
estornar significa. Provado por mutação.

⚠️ **E O EIXO DE GESTÃO NÃO TOCA O RAZÃO.** Há teste contando `LancamentoContabil` antes e
depois de mover localização, emitir termo e transferir entre entidades: o número não muda. A
contabilidade do bem (depreciação por NBC TSP 07, alienação com resultado) ficou intocada.

### 20.6 · ⚠️ A CLÁUSULA MAIS PERIGOSA DAS TRÊS SEÇÕES

> **5.19.42** — "avaliações a partir de fórmulas previamente cadastradas, podendo ser
> **editadas pelo próprio usuário**"

**Fórmula editável pelo usuário é código escrito pelo usuário.** A implementação óbvia é
`eval(formula)` ou `new Function(formula)`, e as duas entregam a quem editar o cadastro a
capacidade de ler `process.env` (onde está a senha do banco), abrir conexão ou apagar tabela.

⚠️ **E SANITIZAR POR LISTA NEGRA NÃO RESOLVE:**
`this.constructor.constructor("...")()` alcança o `Function` global sem escrever nenhuma
palavra proibida.

`modules/m10-patrimonial/formula-avaliacao.ts` é um **interpretador**, não um filtro:
tokeniza, analisa e avalia sobre um universo fechado — quatro operações, parênteses, números
e um rol FECHADO de seis grandezas do bem. Identificador global, chamada de função e acesso
a propriedade **não são bloqueados: são inexprimíveis**. Metade do arquivo de teste é
negação. Tudo em `Decimal`.

### 20.7 · ⚠️ ITEM 3 — O REPONTAMENTO, E POR QUE ELE NÃO É UM `UPDATE`

As quatro contas que o ENT04 mediu foram repontadas:

| Era | O que ela é no PCASP | Passou a ser |
|---|---|---|
| `1.1.1.1.2.00.00` | CAIXA E EQUIVALENTES — **INTRA OFSS** | `1.1.1.1.1.19.00` |
| `1.1.5.1.1.00.00` | **MERCADORIAS PARA REVENDA OU DOAÇÃO** | `1.1.5.6.1.01.00` |
| `2.2.1.1.1.00.00` | **PESSOAL A PAGAR** | `2.2.2.1.1.02.98` |
| `1.1.2.2.0.00.00` | **CLIENTES** (e sintética) | `1.1.2.1.1.99.00` |

⚠️ **TROCAR O CÓDIGO DA CONTA SERIA RAZÃO REESCRITO COM OUTRO NOME.** Os lançamentos já
feitos passariam a apontar para um conceito diferente do que tinham quando foram feitos, e o
balancete do exercício anterior mudaria sozinho sem nada que explicasse por quê.

`repontarConta` move o saldo com um **lançamento que explica a mudança**, acompanhado de um
registro (`MigracaoDeConta`) com origem, destino, data, motivo e o saldo migrado.
**Caracterização primeiro** (três testes escrevem o saldo como ele está, antes de mover), e
a propriedade que vale é a **conservação**: `Σ(origem) + Σ(destino)` é o mesmo antes e
depois. Recusa: repontar duas vezes, destino sintético, naturezas opostas, saldo invertido
("conserte a causa primeiro") e conta de destino inexistente.

⚠️ **UM ACHADO DENTRO DO ACHADO.** O próprio `prisma/seed/pcasp.ts` dizia, desde o M04, que
aqueles códigos **não eram oficiais** e que "o xlsx confirma ou corrige". O xlsx chegou no
ENT04. Este lote é o que executou a correção que o comentário previa.

### 20.8 · ⚠️ O QUE NÃO ENTROU — ITEM 2, e a meta de 80 a 120

**O ITEM 2 (superfície pelo molde) não foi executado.** As três seções ganharam modelo,
caso de uso e teste; **nenhuma ganhou tela**. É a razão de as 54 cláusulas entrarem como
`IMPLEMENTADO_NAO_VALIDADO` e não como `VALIDADO_LOCALMENTE`.

**A meta era 80 a 120 e vieram 54.** A diferença não é ritmo: é que o lote gastou em
MODELO o que a meta supunha gasto em modelo **e** superfície. Três domínios novos
(almoxarifado físico com 14 modelos, gestão do bem com 11, a compra com 12) mais a correção
de eixo do ITEM 3 consumiram o lote inteiro.

⚠️ **E A ORDEM ESTAVA CERTA.** A superfície sobre modelo errado custa o dobro, e o segundo
pagamento é feito com migração de dados — foi exatamente isso que o ITEM 3 acabou de pagar
por uma decisão tomada no M04. O molde agora tem sobre o que montar: **as telas das três
seções são lote de superfície, e é lá que as 54 viram `VALIDADO_LOCALMENTE`.**

### 20.9 · ITEM 4 — medido, e a pendência fica

A STN/MSC **não entrou no corpus**. O único arquivo de fonte de recursos presente
(`relacionamento_fonterecursos_co_2026.xlsx`, TCE-PB) foi lido: **97 linhas de pares
`CODIGO FONTE RECURSOS` × `CODIGO CO`** — códigos, não descrições.

Pela regra do próprio lote: os 30 códigos oficiais permanecem e a pendência
`FONTES-DESCRICAO-STN-MSC` fica. **Não preenchi por inferência.**

### 20.10 · A REGRA NOVA — instrumento nasce com a prova de que acusa

Três instrumentos nasceram ou mudaram neste lote, e os três têm mutação nas duas direções:

| Instrumento | Mutação | O teste que morre |
|---|---|---|
| posição de estoque | corte por instante UTC | a borda de 23h50 de 31/12 |
| preço médio | devolve zero em vez de recusar | a negação do estoque zerado |
| estado do bem | estorno vira movimento comum | "o estorno ANULA" |
| estado do bem | corte por instante UTC | a borda de 31/12 |
| censo de ausências | nome ausente reaparece | "continua ausente: inventário de BENS" |
| censo de ausências | leitor conquistado é renomeado | "continua existindo: ficha de controle" |

⚠️ **E A ÚLTIMA LINHA CUSTOU TRÊS TENTATIVAS — as duas primeiras provaram o contrário do
que eu queria.**

1. Renomeei `fichaDeControleDeEstoque` para `fichaDeControleDeEstoqueRemovida`: o regex
   continuou casando com o **prefixo**. Mutação inválida;
2. renomeei de verdade, e o teste **continuou verde** — casando com a chave homônima que eu
   mesmo escrevera no `FORA_DO_CENSO` do M16. **O guard estava atestando a existência de um
   leitor pelo formulário que o declara;**
3. troquei o padrão para `saldoAnterior`, um campo do retorno, e ele casou com o **Balanço
   Financeiro do M12**, que usa o mesmo nome há lotes. Padrão genérico não é mais seguro que
   específico — é só menos honesto.

A correção foi estrutural: a prova de EXISTÊNCIA passou a ignorar os arquivos que apenas
**nomeiam** coisas (o censo de ações do M16). A lista de AUSÊNCIA não precisa da exclusão, e
é de propósito: lá, um nome que aparece na papelada é justamente o sinal de que alguém
começou a construir.

### 20.11 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao` | **10 de 10**, saída 0; 196 arquivos / 2.055 testes verdes nas duas passagens de fuso — ver 20.12 | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **54 promovidas**; 316 de 2037 (15,5%) — o percentual não se move (20.1) | 2026-09-11 |
| `npx prisma migrate dev` | 6 migrations novas (eixo físico, gestão do bem, compras, e três de enum de ação) | 2026-09-11 |
| `npm run db:sql` | 24 arquivos aplicados, com 2 índices parciais novos | 2026-09-11 |

⚠️ **O SMOKE PELO NAVEGADOR NÃO RODOU NESTE LOTE**, e é consequência direta de 20.8: não há
tela nova para percorrer. O smoke do ENT03c/ENT04 continua válido sobre o que ele já cobria.

### 20.12 · O portão do ENT05 — 10 de 10

Rodada de `2026-09-11T16:16:14Z`, registro bruto em
`.registro-de-execucao/portao-2026-09-11T16-16-14-305Z.log`, com um log por passo ao lado.

| Passo | Estado | Segundos | Heap declarado | TZ |
|---|---|---|---|---|
| `typecheck:backend` | ok | 17 | 3072 MB | — |
| `typecheck:app` | ok | 3 | 3072 MB | — |
| `typecheck:scripts` | ok | 2 | 3072 MB | — |
| `cobertura-de-tsconfig` | ok | 6 | padrão | — |
| `prisma:validate` | ok | 1 | padrão | — |
| `deriva` | ok | 8 | padrão | — |
| `test:rapido` | ok | 13 | padrão | — |
| `test:tudo` | ok | 703 | padrão | — |
| `test:fuso` | ok | 673 | padrão | `Pacific/Kiritimati` |
| `build` | ok | 39 | 4096 MB | — |

`CODIGO_DE_SAIDA_DO_PORTAO=0`.

**A suíte inteira:** 196 arquivos, **2.055 testes**, verdes nas duas passagens — a de fuso do
hospedeiro e a de `Pacific/Kiritimati`. A rápida: 65 arquivos, 722 testes. Os números são
idênticos entre `test:tudo` e `test:fuso`; é isso que se quer de uma propriedade, e não de
um caso: **o mesmo conjunto passa com o relógio deslocado**, sem teste pulado sob TZ.

**Duas coisas mudaram em relação à primeira rodada deste lote** (7 de 10), e as duas valem
registro porque a diferença entre elas não é de grau:

**1. `test:tudo` saiu de 26 falhas em 9 arquivos para verde.** As 26 eram uma causa só — as
fixtures semeavam e procuravam pelas quatro contas de origem do repontamento (20.6). Não era
regressão: era o guard de 20.6 funcionando com um lote de chamadores ainda por corrigir.

**2. `test:fuso` deixou de sair `pulado`.** Ele declara `depende: ["test:tudo"]`, e na
primeira rodada saiu `pulado 0s` — não porque passasse, mas porque o passo do qual depende
falhou. ⚠️ **`pulado` num portão não é um passo barato; é um passo que não aconteceu.** A
única rodada em que a disciplina de data civil dos três modelos novos foi de fato exercida
sob relógio deslocado é esta, e ela custou 673 s. A leitura correta da primeira rodada não
era "9 de 10 mais um pulado", era **7 de 10 com o instrumento mais caro por rodar**.

**O `build` e o teto de heap.** Os dois passos que precisaram de teto declarado
(`HEAP_DO_PASSO`, 20.10) o precisaram pelo mesmo motivo: o cliente Prisma cresceu com os três
domínios do lote. O `build` sob o padrão do Node morria com *"Ineffective mark-compacts near
heap limit"* **e nenhuma linha dizendo em que arquivo** — é a forma de falha que mais custa a
diagnosticar, porque não se parece com erro de código. Sob 4096 MB compila em 3,9 s. O mesmo
estouro no `typecheck:scripts`, sob 3072 MB, foi o que revelou as 54 chaves duplicadas de
`marcar-catalogo.ts` (20.7): **o teto baixo não estava escondendo lentidão, estava escondendo
um erro de tipo real.**

**O que este portão NÃO cobre, e continua não cobrindo:** o smoke pelo navegador, pela razão
de 20.8 — não há tela nova neste lote para percorrer.

## 21. ENT06 item 0 — a superfície do almoxarifado físico

### 21.1 · A contagem do lote, por natureza

⚠️ **ESTE É LOTE DE SUPERFÍCIE, E A MEDIDA DELE É VALIDAÇÃO, NÃO COBERTURA.** O percentual
do catálogo não se move e não deveria: as cláusulas destas seções já estavam contadas.

| | |
|---|---:|
| **validação — cláusulas que saíram de `IMPLEMENTADO_NAO_VALIDADO`** | **3** |
| construção — cláusulas que saíram de `AUSENTE_CONFIRMADO` | 0 |
| censo — medir o que já existia | 0 |
| **acréscimo de produto SEM cláusula** (fora da contagem) | 3 frentes |
| catálogo | 316 de 2037 (15,5%) — inalterado |

```
IMPLEMENTADO_NAO_VALIDADO   88  ->  85     (−3)
VALIDADO_LOCALMENTE         43  ->  46     (+3)
```

⚠️ **TRÊS, E A SEÇÃO 5.18 TINHA QUINZE ESPERANDO.** Este lote deu tela a quase todas — sete
descritores pelo molde, uma tela escrita à mão, quinze rotas no build. E ainda assim só três
foram promovidas, porque `VALIDADO_LOCALMENTE` afirma que o caminho foi **atravessado pela
interface**, e a maior parte dele não pôde ser.

**A razão é uma só, e está nomeada em 21.4: não há tela de ENTRADA de material.**

As três promovidas — 5.18.8 (requisição com acompanhamento), 5.18.12 (inventário bloqueando
a movimentação) e 5.18.13 (bloqueio por depósito) — são exatamente as que não dependem de
haver estoque na prateleira.

**Os acréscimos de produto sem cláusula**, fora da medida: o agendamento do passo de fuso
pelo diff (21.2), o detector de deriva entre censo e perfis (21.5) e as seis faixas novas do
painel de pendências.

### 21.2 · O agendamento do portão — lido do diff, não escolhido

`test:fuso` é a suíte inteira de novo sob `TZ=Pacific/Kiritimati`, e custa o mesmo que
`test:tudo` — entre 673 s e 908 s nas medições desta máquina. Rodar os dois em todo portão
dobra o passo mais caro, e **um portão de trinta minutos passa a ser rodado no fim do dia**.

`scripts/fuso-do-diff.ts` decide por **caminho** (`packages/datas`, os guards de período, as
janelas de relatório do M12, o próprio decisor e o portão) e por **conteúdo** (`new Date`,
`Date.now/UTC/parse`, `getUTC*`, `toISOString`, `toLocale*String`, `Intl.DateTimeFormat`, os
helpers civis do núcleo, o vocabulário de eixo temporal e `vi.setSystemTime`).

⚠️ **É AGENDAMENTO, NÃO RIGOR.** Nada deixa de rodar: o fuso é obrigado sempre que o diff
toca relógio, e `npm run portao -- --fim-de-lote` o roda incondicionalmente.

⚠️ **E ELE FALHA PARA O LADO DE RODAR.** Sem marca do último portão verde, com marca
apontando para commit que sumiu (rebase, reset) ou sem git, a resposta é o passo caro. Um
agendamento que erra para o lado de pular vira, na prática, um passo que nunca roda.

⚠️ **O RELATÓRIO NÃO ESCONDE O AGENDADO.** Estado próprio `agendado`, separado de `pulado`
(que quer dizer "não pôde rodar porque algo quebrou antes"), **fora do numerador**, nomeado
com o motivo e com o comando que o obriga. "10 de 10" com o fuso pulado seria verdadeiro e
enganoso ao mesmo tempo.

### 21.3 · ⚠️ O ACHADO QUE TORNA TUDO ISTO INALCANÇÁVEL EM PRODUÇÃO

Medido no banco de desenvolvimento, e é o maior achado do lote:

```
censo do M16 ........ 223 ações
perfil concedia ..... 185 ações
FALTAVAM ............  38  —  TODAS as do ENT05
```

**O efeito não é um erro na tela: é a tela não existir para quem usa.** O molde esconde o
formulário de quem não tem a ação, e faz certo — oferecer e recusar depois ensina que o
sistema é instável. Então um lote inteiro de funcionalidade entregue fica invisível: sem
mensagem, sem log, sem nada que denuncie. **Ninguém abre chamado dizendo "a tela que eu
nunca vi não apareceu".**

⚠️ **E O BOOTSTRAP NÃO RESOLVE, NEM DEVE.** Ele deriva as permissões de `TODAS_AS_ACOES`,
então nasce correto — mas é ato de INSTALAÇÃO e recusa rodar em banco povoado, de propósito:
um script re-executável capaz de carimbar administrador entregaria a chave-mestra a quem
tivesse acesso ao shell. A recusa é decisão de segurança e continua.

⚠️ **O QUE FALTA É O OUTRO LADO: não existe caso de uso que conceda uma AÇÃO a um PERFIL.**
`concederPerfil` concede o PERFIL a um USUÁRIO — outra coisa. Os únicos escritores de
`PermissaoDePerfil` no repositório são o bootstrap e um teste. Pendência
`CONCEDER_ACAO_A_PERFIL`, e ela bloqueia a entrega do ENT05 e deste lote em qualquer
instalação que já exista.

### 21.4 · ⚠️ O QUE NÃO ENTROU, E POR QUÊ

**Não há tela de ENTRADA de material**, e é ela que trava a promoção das outras doze
cláusulas de 5.18. Sem entrada não entra estoque; sem estoque não há preço médio a calcular,
saída a atender, transferência a fazer nem lote a vencer. O percurso tentou atender a
requisição e o servidor recusou — corretamente — dizendo *"não se entrega o que não há na
prateleira"*.

⚠️ **E A ENTRADA NÃO É UMA TELA A MAIS: ELA NASCE DA LIQUIDAÇÃO.**
`registrarEntradaFisica` aceita `movimentoAlmoxarifadoId`, e o ENT05 mediu que sem essa
amarração a classe contábil fica em zero e a saída é recusada. A superfície da entrada
atravessa M05 e M10 — é lote próprio. Pendência `TELA-DE-ENTRADA-DE-MATERIAL`.

**As seções 5.19 (gestão do bem) e 5.17 (a compra) não ganharam tela neste lote.** O
almoxarifado consumiu-o inteiro, e a razão está em 21.6: o lote não foi só montar molde.

**Sem aba de anexos e sem aba de campos adicionais** nos cadastros novos. As duas custam
MODELO — uma coluna de dono em `Anexo`, um valor em `CadastroComCamposAdicionais` com a FK
correspondente — e este lote não abre modelo. `verificarDefinicao` recusa declarar a aba sem
o modelo, com razão: aba vazia ensina que o sistema perdeu o arquivo. Pendência
`ANEXO-NOS-CADASTROS-DO-ALMOXARIFADO`. ⚠️ O que **já** está ligado ao M22 e não precisou de
modelo: os termos de abertura e fechamento do inventário são `Anexo` desde o ENT05, e
portanto já entram na fila de assinaturas.

**Formulário de UM item onde o caso de uso recebe array.** `cadastrarMaterial` recebe
`unidades[]` e `registrarRequisicaoDeMaterial` recebe `itens[]`; o molde não tem campo
repetidor e **não cresce para ganhar um** (limite 2). A tela cria o caso de UM e diz isso no
campo. Pendências `MATERIAL-COM-MULTIPLAS-UNIDADES` e `REQUISICAO-COM-VARIOS-ITENS`.

**`MarcaAprovada` não tem caso de uso que a crie.** O ENT05 modelou a tabela e a relação, e
o serviço que cadastra a marca não existe — então a ação "Aprovar marca" tem seletor vazio e
o molde o mostra desabilitado. Pendência `CADASTRO-DE-MARCA-APROVADA`.

### 21.5 · ⚠️ O DEFEITO DE EIXO QUE O PERCURSO ACHOU

A mensagem de recusa do servidor dizia *"em 2026-09-10"* para uma data digitada como 11/09.
Medido:

```
z.coerce.date("2026-09-11")  ->  2026-09-11T00:00:00.000Z   (meia-noite UTC)
diaCivil desse instante      ->  2026-09-10                 (o ente é UTC-3)
```

**O operador digita 11 e o sistema guarda um instante cujo dia civil do ente é 10.**

⚠️ **E NÃO É APRESENTAÇÃO.** `posicaoDeEstoque(movimentos, ateDia)` corta por
`compararPorDiaCivil`: um movimento digitado como 11 **entra na posição pedida "até 10"** — a
posição de ontem inclui um movimento de hoje. A ficha de controle (5.18.16) tem o mesmo
corte, e o inventário compara a contagem contra a posição na data de abertura. É justamente
a cláusula "naquela data" que o ENT05 declarou como a razão de não haver coluna de saldo.

**Como o resto do repositório faz:** o M28 recebe `zDia` — a string `YYYY-MM-DD` — e ancora
com `inicioDoDiaCivil`, meia-noite **do ente** (03:00Z). Com a âncora certa, a posição até o
dia 10 responde zero, que é o correto.

⚠️ **POR QUE O GUARD DE DATA CIVIL NÃO PEGOU.** Ele vigia formas no código-fonte: `getUTC*`,
fatiar ISO, `Date.UTC(`, literal `Z` e relógio do hospedeiro. `z.coerce.date()` não é
nenhuma delas — é uma porta nova para o mesmo eixo errado.

⚠️ **E EU TENTEI FECHAR A PORTA COM UM PADRÃO NOVO, E ESTAVA ERRADO.** Acrescentar
`z.coerce.date` às formas proibidas acusou **96 sítios** no repositório, 54 deles nos módulos
do ENT05. O padrão é largo demais porque `z.coerce.date` é **inócuo** quando recebe um
instante ISO completo — o defeito é a string `YYYY-MM-DD` **crua** chegar nele, e isso é
fluxo de dados, não forma no texto. Um guard que exigisse noventa exceções seria a "lista
cheia de exceções que ninguém lê" que o próprio arquivo adverte. Revertido.

**O que fica:** `modules/m10-patrimonial/m10-eixo-de-data-da-entrada.test.ts`, com o
comportamento preso em quatro asserções — inclusive uma amostra em quatro estações provando
que o erro é de **um dia, sempre para trás**, e não deslocamento aleatório nem horário de
verão. Pendência `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05`, no mesmo regime da competência e do
repontamento: caracterizar primeiro, corrigir com movimento que explique a mudança.

### 21.6 · O que o percurso provou, e o que ele custou

`scripts/smoke-ent06.ts` — **48 passos, 0 falhas**. A cadeia: unidade de medida → grupo →
classe contábil → material → depósito → requisição → tentativa de atendimento → inventário →
contagem → fechamento → posição em duas datas → bloqueio → painel.

⚠️ **É O PERCURSO QUE PROMOVE, NÃO O DESCRITOR.** Uma tela do molde compila, aparece no
`next build` e pode estar inteiramente quebrada. O que o percurso provou e nenhum teste de
módulo prova:

- **os três seletores obrigatórios do material têm opção** — e essa asserção nasceu de um
  achado: `ClasseDeMaterial`, `GrupoDeMaterial` e `UnidadeDeMedida` estavam todos em **zero**
  no banco, e os três são campo obrigatório. Sem eles o formulário monta com três seletores
  vazios. Foi o que obrigou a acrescentar os três cadastros de apoio;
- **recarregada, cada lista traz o registro persistido** — não estado de componente;
- **"faltam 10" é derivado**, não coluna;
- **o servidor recusa e a mensagem do domínio sobe como veio**, e depois da recusa o saldo
  continua 10 — nada foi gravado;
- ⚠️ **o bloqueio atravessa de uma tela para outra**: aberto o inventário, a lista de
  depósitos — que não sabe nada sobre inventário — passa a dizer "bloqueada". É isso que
  prova que o bloqueio é FATO do domínio e não rótulo de uma tela;
- **a mesma consulta de posição responde por duas datas**, e a consulta é `GET`.

**Quatro defeitos meus que o percurso pegou**, e nenhum deles era do produto:

1. `relacionados` do material apontava para `/estoque`, que eu **não tinha construído** —
   link para o nada, mesma família de botão sem handler. Foi o que obrigou a construir a
   tela de posição;
2. `detalheDe` lê a página **atual**, e eu procurava o registro depois de ter navegado para
   outra tela — duas vezes, no mesmo degrau;
3. os passos de bloqueio estavam **antes** das movimentações: encerrar com `fim` = hoje deixa
   o bloqueio vigente hoje, e o domínio recusava com razão. No fim do percurso ele prova
   mais — que o bloqueio **recusa** movimentação, com a mensagem nomeando o motivo;
4. a asserção do histórico lia a aba `dados`, que é a que abre por padrão.

⚠️ **E UMA ASSERÇÃO FROUXA, CORRIGIDA PELO BANCO POVOADO.** Eu exigia que a faixa de
inventários abertos não aparecesse no painel, porque o percurso fecha o que abre — mas uma
execução anterior falhara no meio e deixara um inventário aberto, e **o painel estava certo
em contá-lo**. A asserção cobrava do produto um banco limpo. Agora ela afirma a propriedade
(nenhuma faixa exibe zero), não o estado.

**Dois guards do repositório pegaram a tela escrita à mão:** identidade literal de campo é
proibida (vários formulários coexistem na mesma página), corrigida com rótulo **envolvendo**
o campo; e a primeira versão do comentário que explicava isso derrubou o próprio guard, ao
citar a forma proibida entre aspas — a mesma anatomia que o guard já documenta sobre si.

### 21.7 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao -- --fim-de-lote` | ver 21.8 | 2026-09-11 |
| `npx tsx scripts/smoke-ent06.ts` | **48 passos, 0 falhas** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **3 promovidas**; 316 de 2037 (15,5%) — o percentual não se move | 2026-09-11 |
| `npm run deriva:perfil` | 38 ações sem perfil → concedidas em dev → "censo e perfis batem: 223 ações" | 2026-09-11 |

⚠️ **O QUE NÃO RODOU:** nenhuma migration — este lote não abriu modelo.

## 19. O próximo passo

⚠️ **O ENT05 está FECHADO e PARADO no gate** — 10 de 10, saída 0 (20.12). Nada foi
publicado, nada foi transmitido, nenhum push externo.

**Para o ENT06**, na ordem que a medição de 20.1 impõe:

0. ⚠️ **O ITEM 2 DO ENT05 — as telas das três seções, pelo molde.** É a única frente do
   projeto onde o modelo já está de pé, testado contra banco, e **só falta superfície**:
   almoxarifado físico (14 modelos), gestão do bem (11), a compra (12). É também a única
   forma de as **54 cláusulas de `IMPLEMENTADO_NAO_VALIDADO` virarem `VALIDADO_LOCALMENTE`**
   — hoje elas existem no servidor e nenhum servidor municipal as alcança. **Lote de
   superfície: a meta por natureza é alta**, e aqui o molde rende, porque não precisa
   inventar modelo antes.

1. **Continuar o censo.** Ele rendeu **220 cláusulas** no ENT03c; sobram **1.726** em
   `NAO_VERIFICADO` — 5.12 (folha, em outro ORM), 5.8 (características gerais), 5.20–5.22.
   ⚠️ **Continua sendo o melhor retorno por hora do projeto**, e o ENT05 não muda isso: o
   ENT05 mostrou o que acontece quando se constrói sobre seção já censada — move situação,
   não cobertura. As 1.726 são cobertura.

2. **As decisões de modelo ainda abertas** (`docs/varredura-de-modelo-ent04-ent05.md`, e as
   D1–D14 de `docs/varredura-ent05-tres-secoes.md` que ficaram como pendência). Continuam
   sendo o item mais barato agora e o mais caro de adiar — **o ITEM 3 deste lote foi a conta
   de uma decisão de modelo adiada desde o M04**, paga em migração.

3. **`packages/integracao`** — cofre de credenciais, validação contra esquema, detecção de
   duplicidade, custódia de certificado. O achado do A3 muda a arquitetura, não a
   configuração.

4. **Planejamento** — cotas, contingenciamento, prévia, emendas, audiências.

5. **A decisão de ente que trava duas linhas do inventário**: *qual banco o município usa*.

⚠️ **AS PENDÊNCIAS REGISTRADAS NO ENT05, que não devem ser abertas sem decisão:**
`TRANSFERENCIA-DE-MATERIAL-COM-LOTE`, `AJUSTE-DE-INVENTARIO-EM-LOTE`,
`ESTORNO-FISICO-E-CONTABIL-EM-CASCATA`, `EMPENHO-APONTA-PARA-ORDEM-DE-COMPRA`,
`FONTES-DESCRICAO-STN-MSC`. As três primeiras são recusas explícitas no código, com
mensagem — não são silêncios.

⚠️ **E O QUE A MEDIÇÃO ACUMULADA DIZ SOBRE O DESENHO DOS LOTES.** O ENT03b concluiu que um
lote de 60–90 cláusulas precisaria de ~15 cadastros pelo molde; o ENT03c mostrou que **medir
rendeu 220 num lote só**; o ENT05 mostrou que **um lote de modelo puro rende ~54 e não podia
render mais**, porque três domínios novos consomem o lote inteiro. As três medições não se
contradizem: **a razão cláusulas-por-lote depende da natureza do lote.** Censo rende
cobertura, modelo rende situação, superfície rende validação — e só a terceira é a que o
servidor municipal enxerga.
