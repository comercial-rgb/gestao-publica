# Roteiro Apresentacao Tecnica -- Pregao 90023/2026

**Duracao:** 45 minutos
**Local:** Santa Izabel do Oeste/PR
**Login:** admin@santa-izabel-demo.local / demo2026

## Pre-apresentacao (T-30min)

```bash
git pull origin main
pnpm install
pnpm demo:reset          # zera + repovoa
pnpm demo:start          # sobe api + worker + web
pnpm demo:check          # valida tudo OK (8/8)
```

## Bloco 1 -- Login e Dashboard (8 min)

1. **Login** (1 min) -- multi-tenant, schema isolado por municipio
2. **KPI Cards** (3 min) -- receita, despesa, resultado, servidores
3. **Indices Constitucionais** (4 min) -- saude 15%, educacao 25%, FUNDEB 70%, pessoal LRF 60%

## Bloco 2 -- Graficos e Analise (8 min)

1. **Arrecadacao Mensal** -- 12 meses por origem PCASP-PR
2. **Despesa por Funcao** -- top 10 funcoes (empenhado/liquidado/pago)
3. **Receita x Despesa** -- comparativo + resultado acumulado
4. **Evolucao da Folha** -- 6 meses proventos/descontos/liquido

## Bloco 3 -- Modulo Folha (10 min)

1. **Lista de folhas** -- filtros, status colorido, totais
2. **Detalhe folha** -- header + hash SHA-256 + holerites + totalizadores
3. **Holerite individual** -- recibo imprimivel com Ctrl+P

## Bloco 4 -- Recursos Enterprise (5 min)

1. **Paleta de Comandos** -- Ctrl+K em qualquer tela
2. **Auditoria** -- audit_log com user_id + IP + diff
3. **Multitenancy** -- schema PostgreSQL por municipio

## Bloco 5 -- Arquitetura e Roadmap (10 min)

1. **Stack** -- Node 20 + Fastify + Drizzle + Next.js 15 + BullMQ + 113 testes
2. **Conformidade** -- PCASP-PR, eSocial (S-1200/S-1202), Reforma IR 2025
3. **Gaps + Roadmap** -- RREO/RGF (60d), Audiencia Publica (30d), CAUC (45d)

## Bloco 6 -- Q&A (4 min)

## Checklist final

- [ ] `pnpm demo:check` retorna 8/8
- [ ] Browser em modo tela cheia (F11)
- [ ] Resolucao minima 1366x768
- [ ] Plano B: video gravado da demo
