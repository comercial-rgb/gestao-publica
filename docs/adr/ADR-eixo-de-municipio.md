# ADR — eixo de município: como o produto atende vários entes

- **Estado:** **aceito**
- **Data da decisão:** 2026-09-09
- **Decidida por:** Winner (proprietário do produto)
- **Contexto do lote:** levantada em ENT01, decidida fora dele
- **Substitui:** a recomendação de `tenant_id` + RLS feita na análise inicial do
  documento de origem

## Problema

A base tem 118 tabelas sem coluna de tenant. `EnteConfig` é singleton por chave
primária e o escopo de permissão é `ENTE | UG`. O eixo unidade gestora ×
exercício existe e é a segregação real do sistema; o eixo município não existe.

O contrato em vista é de um município com três unidades gestoras — Prefeitura,
Câmara e Fundo Municipal de Saúde. O eixo que existe cobre esse contrato. O eixo
que falta é requisito de **produto**, não do contrato: vender o mesmo sistema a
vários municípios.

Confundir os dois é o que produz retrabalho. A pergunta não é "o documento exige
multi-tenant?" — não exige. É "como o produto atende o segundo município sem
reescrever o primeiro?".

## Alternativas

### A. Uma instância por município (banco por ente)

O modelo que existe hoje, replicado. Nenhuma mudança no domínio.

- A favor: isolamento absoluto, sem risco de vazamento entre entes; nenhuma
  alteração no razão, no SQL manual ou nos agregados dos demonstrativos.
- Contra: custo operacional multiplicado por município — provisionamento,
  migração, monitoramento e atualização de versão em N ambientes. Sem plano de
  controle comum, cada contratação é uma operação manual.

### B. `tenant_id` em todas as tabelas, com políticas de linha

O alvo descrito no prompt mestre.

- A favor: um banco, uma migração, consolidação trivial entre municípios.
- Contra: retrofit em 118 tabelas. Toda unicidade precisa ser reescopada, toda
  chave estrangeira reverificada, os 17 arquivos de SQL manual revistos e os
  agregados dos demonstrativos reauditados. E o backfill do razão existente
  exigiria `UPDATE` em tabela que ENT00 acabou de tornar imutável para o papel da
  aplicação — exatamente o que o prompt mestre proíbe fazer por conveniência.
- O custo recai sobre o ativo mais caro e mais bem testado do repositório.

### C. Schema por município, com plano de controle em `public`

Cada município recebe um schema `municipio_<slug>` contendo as 118 tabelas como
estão hoje. O schema `public` guarda o cadastro de municípios, planos e módulos
contratados. O schema é resolvido por requisição, no servidor, a partir de
membership confiável.

- A favor: **o domínio não muda.** Nenhuma coluna nova, nenhuma unicidade
  reescopada, nenhum agregado reauditado, nenhum toque no razão existente. As
  três unidades gestoras convivem dentro do mesmo schema, então a consolidação
  Prefeitura + Câmara + FMS continua funcionando como funciona hoje. O
  `saas-municipal` já tem provisionamento de schema por cliente, migração
  aplicada a todos os schemas e resolução por `search_path` — é conhecimento
  operacional pronto, do repositório doador.
- Contra: migração roda N vezes; o `search_path` por conexão é armadilha real em
  pool — contexto que sobrevive à requisição contamina o próximo usuário;
  consulta cruzada entre municípios deixa de ser uma query e passa a ser um
  modelo de leitura alimentado por exportação.

## Decisão

**Alternativa C.**

O que pesa: o ativo caro deste produto é o razão de partidas dobradas com
validação por subsistema e os demonstrativos legais. Toda alternativa que mexe
neles cobra caro e arrisca muito. A alternativa C entrega isolamento duro entre
municípios sem tocar em uma linha do domínio, e reaproveita um provisionamento
que já funciona no repositório doador.

Também descarta um argumento usado antes e que estava errado: a consolidação
entre entidades **não** obriga políticas de linha. Como Prefeitura, Câmara e FMS
ficam no mesmo schema, a consolidação é a mesma consulta de hoje.

Nada disso muda ENT01. A alternativa C é lote transversal próprio, executado
depois do gate.

## O que flipa a decisão

- Necessidade de consulta agregada **entre municípios** dentro do produto — por
  exemplo, um painel de operação do fornecedor sobre todos os contratos. Se isso
  for requisito de produto, reavalie B. Se for necessidade interna do fornecedor,
  resolva com modelo de leitura separado, alimentado por exportação, e mantenha C.
- Contratação em volume que torne a migração N vezes um gargalo operacional
  medido, não presumido.

## Consequências

Enquanto a decisão não for implementada:

1. Cenários de "município A não lê B" permanecem **pendência declarada**, nunca
   atendidos. Está correto como o lote registrou.
2. Nenhum município novo é habilitado.
3. O acesso a `EnteConfig` fica atrás de uma função, não espalhado como leitura
   direta de singleton. Custa nada agora e é o único ponto que a alternativa C
   precisa tocar depois.
4. O script que concede privilégios ao papel `gestao_app` recebe o nome do schema
   como parâmetro, em vez de assumir `public`. É o mesmo script que o
   provisionamento vai reusar.
5. O teste de pool que não carrega contexto entre requisições passa a ser
   pré-requisito da alternativa C, não item opcional do incremento. É a falha que
   transforma isolamento por schema em vazamento silencioso.

## Estado de execução das consequências

| # | Consequência | Situação |
|---|---|---|
| 1 | "Município A não lê B" como pendência declarada | ✅ registrado em `ESTADO-EXECUCAO.md`; **não** marcado como atendido |
| 2 | Nenhum município novo habilitado | ✅ nada foi habilitado |
| 3 | `EnteConfig` atrás de uma função de contexto | ✅ feito em ENT01 — `modules/m01-core-contabil/contexto-do-ente.ts` |
| 4 | Grants do `gestao_app` recebem o schema por parâmetro | ✅ feito em ENT01 — `prisma/papel-runtime.ts` |
| 5 | Teste de pool que não carrega contexto | ✅ feito em ENT01 — `test/isolamento-de-requisicao.test.ts` |

⚠️ **Nenhum dos cinco implanta a alternativa C.** Eles apenas param de dificultá-la:
o schema deixa de estar assumido em dois lugares e o vazamento por pool passa a ter
rede. O provisionamento por município, o plano de controle em `public` e a resolução
de schema por requisição continuam **fora** de ENT01.
