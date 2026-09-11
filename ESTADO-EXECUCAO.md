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

## 17. O próximo passo

⚠️ **O ENT03b está FECHADO e PARADO no gate.** O molde existe e foi provado pelos cadastros
do próprio lote; `DATA-CIVIL-RESTANTES` está fechada e provada por mutação; a varredura do
ENT04/ENT05 trouxe treze decisões de uma vez.

**Para o ENT03c**, na ordem em que o relógio cobra:

1. **As treze decisões da varredura** (`docs/varredura-de-modelo-ent04-ent05.md`). Elas não
   exigem contato externo nem credencial — são decisões de **MODELO**, e o custo de tomá-las
   agora é uma conversa; o de tomá-las depois é migração de dados sobre fatos que o tribunal
   já recebeu. **É o item mais barato e o mais caro de adiar.**
2. **`packages/integracao`** — cofre de credenciais por entidade e ambiente, validação contra
   esquema, detecção de duplicidade em retransmissão, custódia de certificado. ⚠️ O achado do
   **A3 muda a arquitetura, não a configuração**: a chave não sai do dispositivo, então a
   assinatura acontece **na máquina do usuário**, não no servidor.
3. **Planejamento** — cotas, contingenciamento, prévia, emendas, audiências, que saíram do
   ENT03b por decisão da revisão.
4. **Baixar os leiautes públicos** — TCE/SC (IN TC-28/2021, IN TC-35/2024), ADN, eSocial.
   Credenciamento é **calendário, não desenvolvimento**.
5. **A decisão de ente que trava duas linhas do inventário**: *qual banco o município usa*.

⚠️ **E o que a medição deste lote diz sobre o desenho dos próximos.** O molde cortou o custo
por cadastro; o catálogo tem **~4 cláusulas por cadastro**. Um lote que queira 60–90 cláusulas
precisa de **~15 cadastros pelo molde** — não de mais profundidade nos que já existem. Os
candidatos com modelo já pronto e sem tela são: **dívida fundada, PPP, obras com medições,
diárias e adiantamentos, extraorçamentário, e os cadastros do ENT05** (almoxarifado,
patrimônio, frota). Cada um deles é hoje um descritor e duas rotas.

⚠️ **O padrão a procurar continua o mesmo, e já apareceu QUATRO vezes**: o modelo responde
"agora" e o documento pergunta "naquela data". Foi a competência, a conta multifonte, a
conciliação — e agora, na varredura, a **posição de estoque**, o **preço médio**, a **margem
consignável** e a **situação do bem**. Quando um requisito disser "na data", **verifique antes
de construir se o modelo tem o eixo**.

E de pé desde o ENT01: o **lote de tenancy** fecha os itens 4, 5 e 7 do incremento do ENT01 e
o teste 1 do ENT02. Enquanto ele não vier, esses continuam declarados — nunca marcados como
atendidos, e nenhum município novo habilitado.
