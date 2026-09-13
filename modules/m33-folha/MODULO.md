# M33 — Folha de pagamento (RH bloco 2)

**V6 P2.3. Regime de rigor: PROFUNDIDADE.** TR 5.12.50–5.12.54, 5.12.61–5.12.63, 5.12.65,
5.12.66, 5.12.79 (parcial: ver o catálogo). Decisão fundadora em
`docs/adr/ADR-folha-tabelas-do-ente.md`.

## O que é

A folha MENSAL de uma competência: todos os vínculos vivos do M32, cada um com o seu
contracheque — linhas por rubrica, totais, a MEMÓRIA de cálculo canônica e o sha256 dela — e o
cálculo como fato numerado. O motor (`dominio.ts`) é puro: tabelas do ente + rubricas +
lançamentos + vida funcional → contracheque. O serviço lê, escolhe a vigente e grava.

## Nenhum código no código

`TabelaDeContribuicao` (por regime RGPS/RPPS, faixas, teto), `TabelaIrrf` (faixas, dedução por
dependente, desconto simplificado, parcela isenta 65+, redutor) e `TabelaSalarioFamilia` são
cadastradas pelo ente, vigentes por competência (AAAA-MM), com `fundamentacaoLegal` obrigatória.
Sem tabela vigente: `TABELA-AUSENTE` nomeando tipo e competência. Duas com o mesmo início:
`TABELA-AMBIGUA`. A aplicabilidade dos cenários do IRRF vem dos campos da tabela — não há data
embutida.

**As tabelas dos testes são FIXTURES sintéticas**, com valores redondos para conferir à mão. Não
afirmam alíquota oficial. O repositório não semeia tabela federal: quem cadastra é o ente, pela
tela `/folha/tabelas`, a partir da portaria vigente.

## Invariantes (NUNCA violar)

1. Dinheiro é `Decimal` (`toMoney`, half-even, por faixa e por linha).
2. Cálculo é fato numerado por folha; cancelamento e fechamento são fatos; nenhum UPDATE.
3. Folha fechada não se recalcula; cálculo fechado não se cancela.
4. Vínculo sem regime previdenciário não entra: recusa nomeando a matrícula.
5. O vencimento é o VIGENTE NO ÚLTIMO DIA da competência (M32 `salarioBaseVigenteEm`): a promoção
   de junho não muda maio.
6. Mês fiscal de 30 dias; admissão, desligamento e afastamento reduzem; dias sobrepostos contam
   uma vez; o retorno é o primeiro dia trabalhado.
7. A mesma pessoa com mais de uma matrícula: contribuição RGPS agregada (bases somadas, teto uma
   vez, rateio proporcional, centavo no último) e IRRF de uma fonte pagadora, rateado pela renda.
8. As naturezas sistêmicas (vencimento, gratificações, contribuição, IRRF, salário-família)
   existem UMA vez cada.

## Arquivos

- `prisma/schema/m33-folha.prisma` (+ `Vinculo.regimePrevidenciario` no M32)
- `prisma/migrations/20260913200000_v6_acoes_folha/`, `20260913200100_v6_folha/` (CHECKs
  próprios: competência AAAA-MM, alíquotas em [0,1], redutor inteiro ou nenhum, líquido =
  proventos − descontos, dias em [0,30])
- `modules/m33-folha/dominio.ts` — faixas, contribuição, IRRF, salário-família, dias,
  contracheque, agregação por pessoa, canônico + sha256, Zod
- `modules/m33-folha/servico.ts` — 9 serviços, 7 ações + `CONSULTAR_FOLHA`; permissões **v10**
- `modules/m33-folha/apropriacao.ts` — o grupo de empenho e o ato de apropriar (2 ações,
  permissões **v12**); `prisma/migrations/20260913230000_*` e `20260913230100_*`
- `modules/m33-folha/m33-folha.test.ts`
- `lib/portas/recursos/folha.ts` + `folha-dados.ts`; `app/(areas)/folha/**`
- `lib/portas/portal-do-servidor.ts` + `app/(areas)/portal-do-servidor/**` — o contracheque na mão
  do próprio servidor (V6 P2.4): só folhas FECHADAS, recorte pela pessoa da sessão
- `scripts/smoke-folha.ts`, `scripts/smoke-portal-do-servidor.ts`

## A APROPRIAÇÃO CONTÁBIL (V6 P2.3b — TR 5.12.71)

A folha FECHADA vira despesa: `apropriarFolha` chama o `empenhar` do M05 — mesmo roteiro
contábil, mesma trava de ficha, mesmo exercício conferido, mesma fila do art. 141. Nada aqui
reimplementa despesa.

**O grupo de empenho** (`GrupoDeEmpenhoDaFolha`) diz QUAIS rubricas de provento, em QUAL ficha,
com qual categoria do art. 141, e se o empenho é POR SERVIDOR (credor = o CPF de cada um) ou UM
SÓ para o grupo (credor declarado). As duas práticas existem nos entes; escolher uma por dentro
seria inventar norma que o TR não fixa. Uma rubrica pertence a UM grupo só.

**Três decisões que o arquivo `apropriacao.ts` documenta linha a linha:**

1. **Só o BRUTO é empenhado.** Contribuição e imposto retidos do servidor não são despesa
   orçamentária — são retenções que viajam no pagamento. Empenhar o líquido esconderia da despesa
   a parte retida; empenhar bruto + descontos a contaria duas vezes.
2. **A numeração é determinística** (`série/competência/matrícula`) e é ela que dá IDEMPOTÊNCIA:
   o `@@unique([fichaId, numero])` do M05 faz a segunda tentativa reconhecer o que já existe.
3. **A apropriação NÃO é atômica entre empenhos**, e a razão é medida: `deps.despesa.empenhar`
   abre a própria transação no adapter do M05 (é lá que a ficha é travada), e uma transação única
   para mil empenhos manteria as fichas do ente travadas por minutos. Ela é RETOMÁVEL: diz onde
   parou, e os empenhos gravados continuam valendo.

## Fora de escopo aqui — pendências nomeadas

- `LIQUIDACAO-DA-FOLHA` — a apropriação EMPENHA; liquidar continua sendo ato próprio, na tela da
  despesa. O fechamento é o atesto do CÁLCULO, não o do recebimento do serviço prestado.
- `PATRONAL-NA-MEMORIA` (5.12.72/73) — `aliquotaPatronal` existe na tabela de contribuição e a
  memória ainda não calcula a parte patronal; sem ela não há empenho de encargos.
- `FOLHAS-NAO-MENSAIS` (5.12.50) — 13º (1ª e 2ª parcela), férias, rescisão, complementar,
  adiantamento. O `TipoDeFolha` só tem MENSAL.
- `FALTAS-NA-FOLHA` — faltas e suspensões como redutor de dias (hoje só admissão, desligamento e
  afastamento do M32).
- `PENSAO-ALIMENTICIA-NA-FOLHA` (5.12.74–5.12.77) — a finalidade existe no M32; o desconto e a
  dedução no IRRF não.
- `CONSIGNACOES-E-MARGEM` (5.12.37–5.12.39, 5.12.83) — o consignado entra como desconto
  informado; não há margem.
- `ARREDONDAMENTO-DA-FOLHA` — half-even (o do razão); half-up é decisão a registrar se exigida.
- `CONTRACHEQUE-EM-PDF` e `RESUMO-DA-FOLHA` (5.12.64, 5.12.69) — P4.
