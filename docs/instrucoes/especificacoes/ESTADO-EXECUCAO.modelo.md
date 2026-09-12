# Estado da execução

> Modelo. O arquivo real vive na raiz do pacote como `ESTADO-EXECUCAO.md` e é
> **produzido** por ENT00, não fornecido a ele. Atualize ao fim de cada lote,
> com dados reais. Sem estimativa, sem percentual de cobertura, sem "provavelmente".

## Identificação

| Campo | Valor |
|---|---|
| Último lote concluído | |
| Data e hora | |
| Repositório de trabalho | |
| Commit | |
| Branch | |
| Executor | |

## Ambiente verificado

| Item | Valor | Verificado em |
|---|---|---|
| Node | | |
| Gerenciador de pacotes | | |
| Postgres desenvolvimento | host:porta/database | |
| Postgres teste | host:porta/database | |
| Redis, se aplicável | | |
| Migrations aplicadas até | | |
| `prisma/sql/` aplicado | sim/não | |

## Comandos executados neste lote

| Comando | Resultado | Duração | Data |
|---|---|---|---|
| | | | |

Registre o resultado real, inclusive falhas. Classifique cada falha como
ambiente, dependência ausente ou negócio.

## O que passou a funcionar

Descreva a cadeia de negócio que ficou utilizável e como navegar até ela.
Número de arquivos e de testes não substitui esta seção.

| Capacidade | Rota real | Como verificar |
|---|---|---|
| | | |

## Invariantes verificadas neste lote

| Invariante | Teste que a viola | Resultado |
|---|---|---|
| Dinheiro em Decimal | | |
| Ledger append-only | | |
| Idempotência de entrada externa | | |
| Balanceamento por subsistema | | |
| Período fechado bloqueia escrita | | |
| Isolamento entre municípios e entidades | | |

## Migrações e SQL aplicados

| Migration ou arquivo | Efeito | Reversão prevista |
|---|---|---|

## Pendências reais

Separe o que ficou por fazer do que está bloqueado por terceiro.

| Pendência | Natureza | Bloqueia | Próxima ação | Responsável |
|---|---|---|---|---|

## Dependências externas

Espelho resumido de `docs/dependencias-externas.md`, só o que mudou neste lote.

| Órgão | Integração | Estado | Próxima ação |
|---|---|---|---|

## Situação do catálogo

Quantas cláusulas mudaram de situação **com evidência**, e quais. Nenhuma
cláusula muda por existir comentário de rastreio no código.

| Cláusula | De | Para | Evidência |
|---|---|---|---|

## Próximo lote

| Campo | Valor |
|---|---|
| Prompt a executar | |
| Pré-condições | |
| Riscos conhecidos | |
