# Estado da execução

> Produzido por ENT00 em 2026-09-09. Dados reais, medidos nesta máquina.
> Sem estimativa, sem percentual de cobertura, sem "provavelmente".

## Identificação

| Campo | Valor |
|---|---|
| Último lote concluído | **ENT00** — preservar, instrumentar e obter baselines reais |
| Data e hora | 2026-09-09, 13:17 (UTC-4) |
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
| Migrations aplicadas até | `20260728160000_contrato_campos_tr` — **64 migrations**, nos dois bancos | 2026-09-09 |
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
| `npx prisma migrate deploy` | gestao-publica (dev) | 64 migrations aplicadas | — | 2026-09-09 |
| `npx prisma migrate deploy` | gestao-publica (teste) | 64 migrations aplicadas | — | 2026-09-09 |
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
| `GRANT`/`REVOKE`/`CREATE ROLE`/`ROW LEVEL SECURITY` nas 64 migrations | **zero ocorrências** |

Domínio protege quem passa por ele. Não protege de um script, de um console de
banco ou de um adapter futuro. O teste correspondente está marcado com
`it.fails`: ele afirma que a asserção correta **não passa hoje**. Quando ENT01
criar o papel de runtime sem propriedade das tabelas, a asserção passará e o
`it.fails` ficará vermelho de propósito — é o lembrete de remover o marcador.
Um teste que expira sozinho vale mais que um TODO que ninguém lê.

Isto é pré-requisito direto de ENT01, que exige papel sem `BYPASSRLS`, sem
propriedade indiscriminada das tabelas e sem DDL.

## Migrações e SQL aplicados

| Migration ou arquivo | Efeito | Reversão prevista |
|---|---|---|
| 64 migrations de `prisma/migrations/` | Schema completo M01–M20 + adapters | Nenhuma reescrita; evolução aditiva |
| 17 arquivos de `prisma/sql/` | Índices parciais e checks que o Prisma não representa | Reaplicáveis por `npm run db:sql` |

Nenhuma migration foi criada, apagada ou reescrita neste lote.

`migrate deploy` sozinho **não** deixa o banco pronto: índice parcial ausente não
gera drift e não aparece no diff do Prisma. Os 17 arquivos foram aplicados nos
dois bancos.

## Pendências reais

| Pendência | Natureza | Bloqueia | Próxima ação | Responsável |
|---|---|---|---|---|
| Ledger mutável pelo papel da aplicação | Segurança / invariante 2 | ENT01 | Criar papel de runtime sem propriedade das tabelas, sem DDL, sem `BYPASSRLS`; avaliar `FORCE ROW LEVEL SECURITY` | ENT01 |
| `test/` fora dos três alvos de typecheck | Qualidade | nada hoje | `tsconfig.backend.json` não inclui `test/` e `tsconfig.json` o exclui: erro de tipo em teste só aparece em runtime | a definir |
| 15 vulnerabilidades em dependências | Ambiente | nada hoje | **Não corrigidas de propósito**: `npm audit fix --force` troca versões e o lote exige preservar a instalação reproduzível. Tratar em commit separado com regressão completa | a definir |
| `PROJETO.md` defasado | Documentação | leitura futura | Ver divergência abaixo | ENT01 |
| Nenhuma credencial ou convênio externo | Dependência de terceiro | validação externa de cada integração | Ver `docs/dependencias-externas.md` | a definir |
| Referência de conformidade em código de tela | Interface | ENT01 | `app/(areas)/administracao/usuarios/AcoesUsuario.tsx` traz `(TR 4.55/4.56)` em comentário — permitido — mas `app/(areas)/integracoes/sagres/page.tsx` carrega `secao: "§4.4"` em **dado renderizado**. ENT01 proíbe rótulo de conformidade na interface: conferir o texto efetivamente renderizado | ENT01 |

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

## Próximo lote

| Campo | Valor |
|---|---|
| Prompt a executar | `prompts/01-CONTEXTO-E-PRIMEIRA-ENTREGA.md`, com `especificacoes/PRIMEIRA-ENTREGA.md` |
| Pré-condições | Gate de ENT00 aprovado. Ambiente de pé: container na 5436, dois bancos migrados e com `prisma/sql/` aplicado |
| Riscos conhecidos | (1) O papel da aplicação é superusuário e dono das tabelas — ENT01 exige o oposto, e a correção precisa vir **antes** dos testes de isolamento, senão eles passam por engano. (2) A cadeia da despesa (M05) e o ledger (M01) precisam de caracterização antes de ganhar tela: rodar a suíte desses módulos e registrar saldo por data, geração de lançamento por evento, regra de estorno por perna e período aberto. (3) O cenário de aceite de ENT01 tem pernas de valores diferentes — caixa leva o líquido, demais pernas o bruto; quem persiste não pode recarimbar valor único por cima |
