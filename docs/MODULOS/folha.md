# Modulo Folha de Pagamento

Status: B35.5 concluido. Engine, worker BullMQ, rotas REST, WebSocket de progresso,
E2E ponta-a-ponta e smoke de ambiente prontos. Proximo: B36 (folhas suplementares).

## Visao geral

Motor de calculo de folha de pagamento para servidores municipais brasileiros,
com suporte a regimes mistos (RGPS + RPPS + isento), compliance fiscal completo
e auditoria TCE.

```
+--------------------------------------------------------------+
|                    apps/api (Fastify)                         |
|  POST /folhas/:id/holerites/simular  -> SYNC (engine puro)   |
|  POST /folhas/:id/fechar             -> ASYNC (BullMQ)       |  <- B35.4
+---------------------------+----------------------------------+
                            |
+---------------------------v----------------------------------+
|              packages/folha-engine                            |
|  - resolvers (3 camadas: snapshot, custom, federal)           |
|  - calculadoras (proporcionalidade, INSS, IRRF, SF, 13o)     |
|  - engine (calcularHolerite + montarContextoCalculo)          |
|  - esocial (builder S-1200/S-1202 + codigos S-1010)          |
+---------------------------+----------------------------------+
                            |
+---------------------------v----------------------------------+
|              apps/worker (BullMQ)                             |  <- B35.3
|  - processarFolhaMensal (concorrencia 1 por tenant)           |
|  - recalcularHolerite                                         |
|  - gerarEmpenhosFolha                                         |
|  - enviarEsocialS1200                                         |
+--------------------------------------------------------------+
```

## Conceitos-chave

- **Holerite**: calculo de UM vinculo numa competencia (1 servidor x 1 mes)
- **Folha**: agregacao de N holerites numa competencia (toda a prefeitura num mes)
- **Vinculo Funcional**: 1 pessoa pode ter N vinculos (efetivo + comissionado)
- **Regime Previdenciario**: define como calcula INSS -- `rgps` (progressivo federal), `rpps` (linear municipal), `isento`
- **Snapshot Fiscal**: copia imutavel do calculo, hash SHA-256 -- auditoria TCE

## Fluxo de calculo (`calcularHolerite`)

1. **Resolver tabelas** (uma vez por job, cacheado): INSS, IRRF, Salario-familia, RPPS
2. **Buscar dados do vinculo**: eventos do mes, dependentes, consignacoes
3. **Para cada rubrica**: aplicar proporcionalidade (5 estrategias)
4. **Somar bases**: INSS, IRRF
5. **Calcular INSS**: progressivo (RGPS) ou linear (RPPS) ou zero (isento)
6. **Calcular IRRF**: 3 cenarios paralelos da Reforma Lei 15.270/2025 -- escolhe o menor
7. **Calcular Salario-familia**: elegibilidade por dependente + idade + renda
8. **Consolidar totais**: proventos, descontos, bruto, liquido, margem consignavel (35%)
9. **Montar snapshot fiscal**: deterministico, sem timestamps
10. **Hashear (SHA-256)** o snapshot fiscal
11. **Retornar** holerite + snapshot completo (com metadata) pra gravacao

## Tabelas oficiais seedadas

| Tabela | Anos cobertos | Fonte |
|---|---|---|
| INSS | 2020-2026 | Portarias Interministeriais MPS/MF |
| IRRF | 2015-2026 | Leis 11.482/2007, 13.149/2015, 14.848/2024, **15.270/2025** (Reforma) |
| Salario-familia | 2020-2026 | Portarias Interministeriais MPS/MF |

Comando para seed:
```bash
pnpm -C packages/database db:seed:folha:publico
```

Cobertura quinquenal (TCE pode auditar ate 5 anos).

## Como usar (exemplo)

```typescript
import {
  calcularHolerite,
  montarContextoCalculo,
} from '@saas-municipal/folha-engine'

// 1. Monta contexto (busca dados do DB)
const contexto = await montarContextoCalculo({
  publicDb,
  tenantDb,
  vinculoId: 'v-123',
  pessoaId: 'p-456',
  competencia: new Date('2026-05-01T00:00:00Z'),
  regimePrevidenciario: 'rpps',
})

// 2. Calcula (funcao pura, ~5-10ms)
const holerite = calcularHolerite({
  contexto,
  rubricas: rubricasDoVinculoMapeadas, // do RH
  dataNascimento: new Date('1980-05-15'),
  pensaoAlimenticia: 0,
  workerId: 'worker-1',
})

// 3. Acessa resultado
console.log(`Liquido: R$ ${holerite.totais.liquido}`)
console.log(`Hash: ${holerite.hashSha256}`)

// 4. Gera XML eSocial (opcional)
import { esocial } from '@saas-municipal/folha-engine'

const evento = esocial.buildEventoRemuneracao({
  holerite,
  regimePrevidenciario: 'rpps',
  empregador: { cnpj: '12345678000190', razaoSocial: 'Prefeitura X' },
  trabalhador: { cpf: '12345678901', nome: 'Maria Silva', dataNascimento: '1980-05-15' },
  vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' },
  folha: { idDmDev: 'FOLHA-202605', ideTabRubr: 'TAB001', codLotacao: '1' },
  ambiente: 'PRODUCAO_RESTRITA', // ou PRODUCAO / TESTE
})

console.log(evento.tipoEvento) // 'S-1202' (RPPS)
console.log(evento.xml)         // XML pronto pra envio
```

## Performance

- Calculo de 1 holerite: ~5-10ms (sem I/O)
- Folha de 1.000 servidores: ~30s (com I/O e DB)
- Folha de 15.000 servidores: ~5min (paralelizado em batches de 200)

## Testes

```bash
pnpm -C packages/folha-engine test
```

Cobertura atual (apos B35.5): **116 testes verdes** -- 81 no engine, 7 no worker,
28 na API.

```bash
pnpm -C packages/folha-engine test   # 81 -- calculo puro, sem I/O
pnpm -C apps/worker test             #  7 -- smoke dos 4 jobs
pnpm test                            # 28 -- integration da API (inclui o E2E)
```

### Engine (81)

| Arquivo | Testes | Escopo |
|---|---|---|
| resolvers.test.ts | 8 | INSS/IRRF/SF/RPPS por vigencia |
| faixas-progressivas.test.ts | 6 | Algoritmo faixa-a-faixa |
| proporcionalidade.test.ts | 9 | 5 estrategias + edge cases |
| inss.test.ts | 8 | RGPS progressivo, RPPS linear, teto agregado |
| irrf.test.ts | 6 | 3 cenarios Reforma IR, dependentes |
| salario-familia.test.ts | 8 | Elegibilidade, renda, RPPS override |
| decimo-terceiro.test.ts | 10 | Avos, parcelas, suplementar |
| engine.test.ts | 6 | CLT, RPPS, isento, admissao, SF, deterministico |
| snapshot.test.ts | 6 | Idempotencia hash, fiscal vs metadata |
| esocial.test.ts | 12 | Categorias, S-1200/S-1202, XML |

### E2E do ciclo completo (B35.5)

`apps/api/test/integration/folha/folha-e2e.test.ts` -- 14 cenarios que atravessam
API -> DB -> worker -> DB -> API com dados reais (3 vinculos, 3 regimes):

criar folha, validar pre-fechamento, simular sem persistir, fechar (202 +
enfileiramento), processar pelo worker, conferir correcao fiscal por regime,
determinismo do hash entre reprocessamentos, consultas de holerite e reabertura
auditada.

O job do worker roda **inline** (Job falso), nao via consumidor BullMQ -- ver
ADR-017 em `docs/DECISOES.md`.

A fixture `seedFolhaCalculoCompleto` (em `apps/api/test/fixtures.ts`) monta o
cenario: RGPS R$ 1.600 com 2 dependentes (salario-familia), RPPS R$ 6.500
(aliquota linear 14%) e comissionado R$ 10.500 (teto INSS + IRRF alto).

## Smoke de ambiente

Checagem read-only de um ambiente ja implantado -- roda pos-deploy e antes do
fechamento mensal:

```bash
pnpm smoke                                    # usa DATABASE_URL / REDIS_URL do ambiente
API_URL=https://api.exemplo.gov.br pnpm smoke # inclui check de /health/ready
SMOKE_COMPETENCIA=2026-05-01 pnpm smoke       # competencia especifica
```

Verifica conectividade (Postgres, Redis, fila `folha`), vigencia das tabelas
federais e, por tenant com o modulo ativo, se todo vinculo ativo tem rubrica
vigente e se ha aliquota RPPS quando existe servidor no regime proprio.

Sai com codigo 1 se houver FALHA; AVISO nao derruba.

## Proximos passos
- **B36** -- Folhas suplementares (13o + ferias + rescisao)
- **B38** -- UI completa (cadastros, simulacao, fechamento)
- **B40-B42** -- eSocial Fase 3+4 (tabelas S-1000/S-1010/S-2200 + envio webservice)
