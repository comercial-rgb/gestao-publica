# ADR — A apropriação da folha empenha pelo M05, com numeração determinística e sem atomicidade entre empenhos

**Situação:** aceita, 2026-09-13 (V6 P2.3b).

## Contexto

O TR 5.12.71 pede "gerar empenhamento automático para o Módulo da Contabilidade conforme as
configurações realizadas, evitando trabalhos de digitação manual". A folha do M33 fecha um cálculo
com sha256; faltava transformá-lo em despesa.

Três coisas não eram óbvias e foram medidas antes de decidir:

1. **Quem é o credor.** Há duas práticas nos entes: um empenho POR SERVIDOR (credor = o CPF de
   cada um) e um empenho GLOBAL do grupo (credor declarado). O TR não fixa nenhuma.
2. **Como numerar.** O `Empenho.numero` do M05 é digitado pelo operador e único por ficha
   (`@@unique([fichaId, numero])`). A folha precisa gerar.
3. **Se a apropriação pode ser atômica.** `deps.despesa.empenhar` abre a PRÓPRIA transação no
   adapter do M05 (`adapter-prisma.ts`: `prisma.$transaction` com `travarFichas` dentro). Passar
   um cliente de transação para ele produziria transação aninhada.

## Decisão

1. **O ente escolhe o credor**, no cadastro do grupo (`porServidor`), e o CHECK impõe a coerência:
   empenho único EXIGE credor declarado; empenho por servidor o PROÍBE (ali o credor é o CPF de
   cada um, e um credor declarado seria ignorado em silêncio).
2. **A numeração é determinística:** `<série do grupo>/<competência>/<matrícula ou código do
   grupo>`. Não há sequência a manter, não há colisão com a numeração manual do ente (a série é
   declarada por ele), e a segunda tentativa de apropriar bate na constraint do M05 em vez de
   duplicar a despesa. **É a numeração que dá a idempotência** — não um flag de "já apropriada".
3. **A apropriação NÃO é atômica entre empenhos, e isso é decisão, não descuido.** Uma transação
   única para mil empenhos manteria as fichas do ente travadas por minutos — o custo real de
   `travarFichas` numa folha de porte municipal. Cada empenho é um fato; a apropriação que parar
   por falta de saldo lança `ApropriacaoInterrompidaError` dizendo quantos já foram, em qual grupo
   e matrícula parou e por quê, e os empenhos gravados CONTINUAM válidos. Continuar é reexecutar.
4. **Só o BRUTO é empenhado.** Contribuição e imposto retidos do servidor são retenções do
   PAGAMENTO (o M05/M09 já as compõe), não despesa orçamentária. O grupo recusa rubrica de
   desconto; e uma rubrica de PROVENTO fora de qualquer grupo interrompe a apropriação ANTES de
   empenhar, nomeando-a — empenhar menos do que a folha paga seria pior do que não empenhar.

## O que NÃO entrou, e por quê

- **A liquidação** (`LIQUIDACAO-DA-FOLHA`): o fechamento é o atesto do CÁLCULO, não o do
  recebimento; liquidar continua sendo ato próprio na tela da despesa.
- **Os encargos patronais** (5.12.72/73): `aliquotaPatronal` existe na tabela de contribuição, mas
  a memória do cálculo ainda não os calcula (`PATRONAL-NA-MEMORIA`). Empenhar um patronal
  estimado aqui seria inventar número.
- **O estorno da apropriação quando o cálculo é cancelado**: hoje a folha fechada não se
  recalcula, então o caso não ocorre pelo caminho normal. Se a anulação dos empenhos da folha
  passar a ser pedida, ela é o `anularEmpenho` do M05, um a um, com o motivo
  (`ESTORNO-DA-APROPRIACAO`).

## Provas

`modules/m33-folha/m33-apropriacao.test.ts` (13 testes, fixture N=2: reexecutar não duplica; a
falta de saldo não apaga o que deu certo; o total apropriado é o BRUTO e não o líquido);
`scripts/smoke-apropriacao-da-folha.ts`.
