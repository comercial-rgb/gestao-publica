# Modulo: Orcamento

Gestao de PPA, LOA, dotacoes orcamentarias, creditos adicionais e historico de execucao, conforme **Lei 4.320/64**, **LRF (LC 101/2000)** e padrao **MCASP/STN**.

> **Slug:** `orcamento`
> **Categoria:** registro (Camada 2)
> **Plano:** Ouro (nao incluido em Bronze nem Prata)
> **Status:** Completo (B22 + B23 + B24 + B25)

## Para quem e

| Perfil | O que faz aqui |
|---|---|
| Controladoria | Cria LOA, registra creditos suplementares, encerra exercicio |
| Contabilidade | Importa dotacoes via JSON, acompanha saldos de execucao |
| Auditoria | Le historico de valor das dotacoes, audita creditos aplicados |
| Gestor financeiro | Consulta saldo disponivel antes de autorizar empenho (Despesas, proxima camada) |

## Conceitos

### PPA (Plano Plurianual)

Lei orcamentaria com **vigencia de 4 anos**. Define **programas de governo** (objetivos politicos plurianuais). Cada programa tem **acoes** que detalham como o objetivo sera executado.

PPA NAO contem valores executaveis. E o "plano". Valores executaveis vem na LOA.

### LDO (Lei de Diretrizes Orcamentarias)

Anual, define prioridades pro exercicio seguinte. **Nao modelado como entidade** no sistema. Tratado como `textos_juridicos` com `tipo='ldo'`.

### LOA (Lei Orcamentaria Anual)

Lei anual que **autoriza gastos**. Composta de **dotacoes**: autorizacoes especificas com classificacao completa STN. Vinculada a um PPA vigente (que define os programas/acoes que a LOA pode referenciar).

### Dotacao

Unidade fundamental de autorizacao. Identificada por **classificacao completa** com 15 componentes:

```
03 . 01 . 10 . 301 . 0001 . 2003 . 3 . 3 . 90 . 30 . 00 . 1 . 500 . 0000 . U
|    |    |    |     |      |    |   |    |    |    |       |       |      |
|    |    |    |     |      |    |   |    |    |    |       |       |      +- Ind. Resultado Primario
|    |    |    |     |      |    |   |    |    |    |       |       +-------- Detalhe da Fonte
|    |    |    |     |      |    |   |    |    |    |       +---------------- Fonte de Recurso
|    |    |    |     |      |    |   |    |    |    +------------------------ Subelemento
|    |    |    |     |      |    |   |    |    +----------------------------- Elemento (ex: 30 = Material)
|    |    |    |     |      |    |   |    +---------------------------------- Modalidade (ex: 90 = Direta)
|    |    |    |     |      |    |   +--------------------------------------- Grupo (ex: 3 = Correntes)
|    |    |    |     |      |    +------------------------------------------ Categoria (3=Corrente, 4=Capital)
|    |    |    |     |      +----------------------------------------------- Codigo da Acao
|    |    |    |     +------------------------------------------------------ Codigo do Programa
|    |    |    +------------------------------------------------------------ Subfuncao (ex: 301 = Atencao Basica)
|    |    +----------------------------------------------------------------- Funcao (ex: 10 = Saude)
|    +---------------------------------------------------------------------- Unidade Orcamentaria
+--------------------------------------------------------------------------- Orgao
```

### Credito orcamentario adicional

Lei posterior a LOA que altera dotacoes. Tres tipos:

| Tipo | Quando se usa | Efeito |
|---|---|---|
| **Suplementar** | Reforcar dotacao existente que esta acabando | Aumenta `valor_atualizado` |
| **Especial** | Criar dotacao nao prevista na LOA original | Insere nova dotacao |
| **Extraordinario** | Emergencia (calamidade, lei federal) | Igual a especial, com fundamento legal especifico |

### Origem dos recursos

De onde vem o dinheiro para o credito:

- `superavit_financeiro` -- sobra de exercicio anterior
- `excesso_arrecadacao` -- receita arrecadada acima do previsto
- `anulacao_dotacao` -- anular outra dotacao para realocar
- `operacao_credito` -- emprestimo
- `reserva_contingencia` -- fundo reservado para emergencias

## Modelo de dados

### Diagrama logico

```
              +----------------------+
              |  leis_orcamentarias  |
              |  (PPA + LOA)         |
              +---------+------------+
                        | (1:N)
          +-------------+-------------------+
          | ppa         | loa               |
          v             |                   |
    +----------+        |                   |
    | programas|        |                   |
    +----+-----+        |                   |
         | (1:N)        |                   |
         v              |                   |
    +----------+        |                   |
    |  acoes   |        |                   |
    +----+-----+        |                   |
         |              |                   |
         v              v                   |
    +--------------------+                  |
    |     dotacoes       |<-----------------+
    |  (valor_inicial,   |
    |   valor_atualizado,|
    |   valor_empenhado, |
    |   valor_liquidado, |
    |   valor_pago, ...) |
    +--+-----------+-----+
       |           |
       | (1:N)     | (N:M via creditos_dotacoes)
       v           v
+--------------+  +------------------------+
| dotacoes_    |  | creditos_orcamentarios  |
| historico_   |  | (suplementar/especial/  |
| valor        |  |  extraordinario)        |
+--------------+  +------------------------+
```

### Tabelas

| Tabela | Funcao | Granularidade |
|---|---|---|
| `leis_orcamentarias` | PPA + LOA unificados | 1 PPA por 4 anos; 1 LOA por ano |
| `programas` | Programas de governo do PPA | ~10-30 por PPA |
| `acoes` | Atividades/projetos/op.especiais dos programas | ~50-200 por PPA |
| `modalidades_aplicacao` | Catalogo STN (90, 30, etc) | 16 modalidades STN + customs locais |
| `fontes_recurso` | Fontes/destinacoes (1.500.0000 etc) | 18 STN + customs |
| `dotacoes` | **Coracao do modulo**: autorizacoes executaveis | 500-2000 por LOA |
| `creditos_orcamentarios` | Creditos adicionais ao longo do ano | 20-100 por exercicio |
| `creditos_dotacoes` | Linhas N:M entre credito e dotacoes afetadas | 2-10 por credito |
| `dotacoes_historico_valor` | Historico de cada mudanca em `valor_atualizado` | 1 por aplicacao de credito x dotacao afetada |

### Decisoes arquiteturais especificas

| ADR | Implicacao no modulo |
|---|---|
| [ADR-010](../DECISOES.md) | PCASP-PR e seed inicial; outros estados via novo seed |
| [ADR-011](../DECISOES.md) | Historico de valor e tabela separada (nao snapshot completo) |
| [ADR-009](../DECISOES.md) | Aplicacao de credito e transacional 7-step |
| [ADR-013](../DECISOES.md) | Importador aceita JSON; XML quando 1o cliente vier |

## Fluxo: do PPA a execucao

```
1. Criar PPA
   POST /tenant/orcamento/leis { tipo: 'ppa', anoInicio: 2026, anoFim: 2029 }

2. Criar programas no PPA
   POST /tenant/orcamento/programas { ppaId, codigo: '0001', nome: 'Saude' }

3. Criar acoes em cada programa
   POST /tenant/orcamento/acoes { programaId, codigo: '2003', tipo: 2 }

4. Criar LOA vinculada ao PPA
   POST /tenant/orcamento/leis { tipo: 'loa', anoInicio: 2026, ppaVigenteId }

5. Criar dotacoes (ou importar em massa)
   Manual: POST /tenant/orcamento/dotacoes
   Lote:   POST /tenant/orcamento/importar/preview -> /importar/commit

6. (Durante o ano) Registrar creditos quando dotacao acaba
   POST /tenant/orcamento/creditos { tipo: 'suplementar', ... }
   POST /tenant/orcamento/creditos/:id/dotacoes { sinal, valor }  (N vezes)
   PATCH /tenant/orcamento/creditos/:id/status { status: 'aprovado' }
   POST /tenant/orcamento/creditos/:id/aplicar { confirmNumero }

7. (Camada 2 - Despesas) Empenhar dotacao
   POST /tenant/despesas/empenhos { dotacaoId, valor, ... }
   -> atualiza dotacoes.valor_empenhado em transacao

8. (Fim de ano) Encerrar exercicio
```

## Operacao critica: aplicar credito orcamentario

**Endpoint:** `POST /tenant/orcamento/creditos/:id/aplicar`
**Permission:** `orcamento:aprovar_credito`

Esta e a operacao mais delicada do modulo. Segue o **padrao fiscal transacional** ([ADR-009](../DECISOES.md)).

### Pre-condicoes

- Credito em status `aprovado`
- Todas as linhas tem dotacao valida vinculada
- Para cada linha de anulacao: `dotacao.valor_atualizado - valor_anulacao >= dotacao.valor_empenhado + dotacao.valor_reservado`

### Fluxo

```
Cliente: POST /aplicar { confirmNumero: 'Decreto 1234/2026' }
    |
    v
1. Validar status = 'aprovado'
2. Carregar linhas com snapshot atual de cada dotacao
3. Simular cada linha:
     delta = sinal x valor
     novo_atualizado = atual + delta
     Se sinal == -1 e novo_atualizado < emp + res: PROBLEMA
     Se novo_atualizado < 0: PROBLEMA
4. Se algum PROBLEMA:
     return 422 { error, message, problemas: [...] }
5. db.transaction(tx => {
     for each atualizacao:
       UPDATE dotacoes SET valor_atualizado = ...
       INSERT INTO dotacoes_historico_valor (...)
     UPDATE creditos_orcamentarios SET status='aplicado'
   })
6. Audit log (fora da transacao)
7. Return 200 { status: 'aplicado', linhasAfetadas, totalDelta }
```

### Garantias

- **Atomicidade**: se qualquer UPDATE falhar, NENHUMA dotacao e alterada
- **Idempotencia por confirmacao**: confirmNumero impede aplicar duas vezes (status muda para `aplicado`)
- **Historico granular**: 1 entrada em `dotacoes_historico_valor` por dotacao afetada

### Cobertura de testes

`apps/api/test/integration/orcamento/creditos.aplicar.test.ts` cobre 3 cenarios:

1. **Happy path**: 1 reforco + 1 anulacao validos -> saldos atualizam + 2 entradas no historico + credito marcado como aplicado
2. **Rollback total**: anulacao maior que disponivel -> 422 com `problemas`, dotacao valida do mesmo credito NAO e tocada
3. **Confirmacao errada**: `confirmNumero` nao bate -> 422 `ConfirmacaoIncorreta`, estado preservado

Runtime: ~860ms total.

## Ativacao do modulo

`orcamento` e incluido **apenas no plano Ouro**. Tenants em Bronze ou Prata precisam ativar manualmente via UI de gestao de modulos.

### Via UI

1. Login como master em `/admin/login`
2. `/admin/tenants/:id/modulos`
3. Toggle "Orcamento" -> ativado
4. Cache invalida imediatamente (Redis pub/sub)
5. Usuario do tenant ao recarregar `/tenant/auth/me` recebe `orcamento` em `activeModules`

### Via SQL (fallback)

```sql
INSERT INTO tenant_modules (tenant_id, module_id)
SELECT t.id, m.id FROM tenants t, modules m
WHERE t.slug = '<slug>' AND m.slug = 'orcamento'
ON CONFLICT DO NOTHING;
```

Lembrar de invalidar cache apos insercao manual:

```bash
curl -X POST http://localhost:3333/admin/tenants/<TENANT_ID>/modules/invalidate-cache \
  --cookie "sm_admin_access=$TOKEN" -H "X-CSRF-Token: $CSRF"
```

## Permissions

| Permission | Quem precisa |
|---|---|
| `orcamento:read` | Todos perfis que consultam |
| `orcamento:write` | Gestor financeiro, controladoria |
| `orcamento:gerir_programas` | Administrador municipal apenas |
| `orcamento:importar_xml` | Administrador municipal apenas |
| `orcamento:aprovar_credito` | Administrador municipal apenas |
| `orcamento:relatorios` | Gestor financeiro, contabilidade, auditoria |

Atribuicao padrao por role: ver `reseedTenantBaseline` em `packages/database/src/tenancy.ts`.

## Endpoints

Documentacao completa via Swagger: `http://localhost:3333/docs` rodando `pnpm dev`.

```
GET    /tenant/orcamento/leis                              Lista PPA + LOA
GET    /tenant/orcamento/leis/:id                          Detalhe + estatisticas
POST   /tenant/orcamento/leis                              Criar (valida vigencia)
PATCH  /tenant/orcamento/leis/:id/status                   Workflow de status

GET    /tenant/orcamento/programas                         Lista por ppaId
POST   /tenant/orcamento/programas                         Criar
PATCH  /tenant/orcamento/programas/:id                     Atualizar

GET    /tenant/orcamento/acoes                             Lista por programaId
POST   /tenant/orcamento/acoes                             Criar

GET    /tenant/orcamento/catalogos/modalidades             STN + locais
POST   /tenant/orcamento/catalogos/modalidades             Criar custom local
GET    /tenant/orcamento/catalogos/fontes                  STN + locais
POST   /tenant/orcamento/catalogos/fontes                  Criar custom local

GET    /tenant/orcamento/dotacoes                          Lista paginada + filtros
POST   /tenant/orcamento/dotacoes                          Criar (auto-monta classificacao)
GET    /tenant/orcamento/dotacoes/:id/saldo                Saldo em tempo real
GET    /tenant/orcamento/dotacoes/:id/historico            Historico de mudancas

GET    /tenant/orcamento/creditos                          Lista
GET    /tenant/orcamento/creditos/:id                      Detalhe + simulacao
POST   /tenant/orcamento/creditos                          Criar
POST   /tenant/orcamento/creditos/:id/dotacoes             Adicionar linha
DELETE /tenant/orcamento/creditos/:id/dotacoes/:linhaId    Remover linha
PATCH  /tenant/orcamento/creditos/:id/status               Aprovar ou cancelar
POST   /tenant/orcamento/creditos/:id/aplicar              [TRANSACIONAL]

POST   /tenant/orcamento/importar/preview                  Valida sem criar
POST   /tenant/orcamento/importar/commit                   Cria em lote
```

## UI

Paginas em `apps/web/app/tenant/orcamento/`:

```
/tenant/orcamento                          Dashboard com metricas da LOA corrente
/tenant/orcamento/leis                     Lista PPA + LOA com filtro por tipo
/tenant/orcamento/leis/nova                Form de criacao (PPA ou LOA)
/tenant/orcamento/leis/:id                 Detalhe + dotacoes paginadas + busca
/tenant/orcamento/dotacoes/:id             Saldo + barra de execucao + historico
/tenant/orcamento/importar                 Importacao em lote com preview
/tenant/orcamento/creditos                 Lista com filtros de status
/tenant/orcamento/creditos/novo            Form
/tenant/orcamento/creditos/:id             Detalhe + simulacao + modais
```

Componentes especificos:
- Tabela de dotacoes com classificacao completa em monospace
- Barra de progresso por dotacao (reservado/empenhado/liquidado/pago)
- Modal de aplicacao de credito com confirmacao por digitacao

## Integracoes futuras

| Quando | O que |
|---|---|
| Camada 2 - Despesas | Endpoints de empenho consomem `dotacao.valor_atualizado` e atualizam `valor_empenhado` no mesmo padrao de ADR-009 |
| Camada 3 - Demonstrativos | RREO consome agregacoes de dotacoes + arrecadacoes |
| Importador XML | Adicionar `POST /importar/xml` que faz parse -> JSON inline (ADR-013) |
| Integracao SICONFI | Exportar MSC mensalmente usando campos `identificador_msc` ja presentes |

## Manutencao

### Adicionar nova modalidade STN

Se STN publicar nova modalidade (raro):

1. Adicionar entrada em `MODALIDADES` no `seed-orcamento-stn.ts`
2. Rodar `pnpm db:seed:orcamento-stn` (idempotente)

### Adicionar PCASP de novo estado

Cliente de outro estado contratado:

1. Criar `packages/database/src/seed-pcasp-<uf>.ts` baseado em `seed-pcasp-pr.ts`
2. Popular `PCASP_<UF>_<ANO>` com naturezas oficiais do TCE estadual
3. Adicionar script no `package.json`: `db:seed:pcasp-<uf>`
4. Rodar com filtro: `pnpm db:seed:pcasp-<uf> --tenant=<slug>`

### Resetar saldos de dotacoes em dev

Util para refazer testes sem reprovisionar:

```sql
UPDATE dotacoes SET
  valor_atualizado = valor_inicial,
  valor_reservado = '0',
  valor_empenhado = '0',
  valor_liquidado = '0',
  valor_pago = '0';

DELETE FROM dotacoes_historico_valor;

UPDATE creditos_orcamentarios SET status = 'em_elaboracao', aplicado_em = NULL;
```

**Nunca rodar em producao.**

## Troubleshooting

### "Programa X nao cadastrado no PPA" durante importacao

LOA precisa ter PPA vinculado via `ppaVigenteId`. Importador so reconhece programas que existem no PPA da LOA destino.

**Solucao:** criar programas via UI ou API antes do import. Ou trocar a LOA pra outra com PPA correto.

### Dotacao com `valor_atualizado < valor_empenhado` apos anulacao

Indica bug de validacao ou aplicacao manual de SQL fora do codigo. Reconciliacao imediata:

```sql
-- Listar inconsistencias
SELECT id, classificacao_completa, valor_atualizado, valor_empenhado
FROM dotacoes
WHERE valor_atualizado::numeric < valor_empenhado::numeric;
```

Se aparecer algo: investigar audit log dessa dotacao. Aplicar correcao manual em transacao.

### Credito travado em `aprovado` sem conseguir aplicar

Provavel `linhasComProblema > 0`. Acessar `/tenant/orcamento/creditos/:id` na UI -- linhas em vermelho mostram o motivo. Ajustar valores ou liberar empenhos pendentes.

## Proximos passos

Quando este modulo ganhar atencao novamente:

- **Despesas**: usar saldos de dotacao em empenho/liquidacao/pagamento
- **Importador XML**: parser inline quando 1o cliente trouxer arquivo real (ADR-013)
- **Demonstrativos**: RREO/RGF agregam dotacoes para anexos da LRF
- **Materializacao** (nao-urgente): se LOA passar de 5000 dotacoes, considerar materialized view para `/leis/:id`
