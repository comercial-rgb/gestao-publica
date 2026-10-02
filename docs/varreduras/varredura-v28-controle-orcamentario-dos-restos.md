# Varredura V28 — controle orçamentário dos restos a pagar no razão (classes 5.3 e 6.3)

Pendência: `INSCRICAO-DE-RP-SEM-PERNA-NO-RAZAO`. Levantada antes de construir porque muda o modelo de
quatro atos do M08, não um só.

## O que existe (medido no código, commit da V28)

- `encerrarExercicioComRestos` (`modules/m08-restos-a-pagar/encerramento.ts`) grava
  `InscricaoRestosAPagar` e `EncerramentoExercicio`. Nenhum lançamento.
- `RoteiroRestosAPagar` tem quatro eventos (`LIQUIDACAO_NAO_PROCESSADO`, `PAGAMENTO`,
  `CANCELAMENTO_PROCESSADO`, `CANCELAMENTO_NAO_PROCESSADO`) e dois pares: o patrimonial e o de controle
  da DDR (classe 8). **Não há par orçamentário (5/6).**
- Na virada, `6.2.2.1.3` (empenhado a liquidar) e `6.2.2.1.3.03` (liquidado a pagar) **encerram**. O
  `MODULO.md` do M08 registra o porquê: nada no exercício seguinte as debitaria, e transferi-las criaria
  saldo de controle que nunca é consumido.
- A tabela de classificação da virada já sugere `TRANSFERE` para os ramos `5.3` e `6.3`, mas hoje nenhum
  lançamento chega a eles.

## O que o PCASP pede (MCASP, Parte IV, controle da execução de RP)

Na inscrição:

- não processado: D `5.3.1.1` (RPNP inscritos) / C `6.3.1.1` (RPNP a liquidar);
- processado: D `5.3.2.1` (RPP inscritos) / C `6.3.2.1` (RPP a pagar).

No exercício seguinte, cada ato move o 6.3: liquidar RPNP (`6.3.1.1` → `6.3.1.3`), pagar (`6.3.x` a
pagar → `6.3.x` pagos) e cancelar (`6.3.x` → `6.3.x.9` cancelados).

As contas exatas por tipo são decisão do contador sobre o plano carregado (`Pcasp_2025.xlsx` do TCE-PB),
não do código.

## Por que não é uma unidade de um ato só

Lançar só a inscrição deixaria `6.3.1.1` e `6.3.2.1` com saldo que nenhum ato posterior consome. É
exatamente o que o `MODULO.md` do M08 rejeitou para `6.2.2.1.3`. A perna só é correta se os **quatro**
atos de execução de RP também ganharem a perna orçamentária, na mesma unidade.

## Opções

**A. Par orçamentário em todos os eventos (recomendada).**

- Migration aditiva:
  - dois valores no enum (`INSCRICAO_NAO_PROCESSADO`, `INSCRICAO_PROCESSADO`);
  - duas colunas anuláveis em `RoteiroRestosAPagar` (`contaOrcamentariaDebitoId`, `contaOrcamentariaCreditoId`);
  - `lancamentoId` anulável em `InscricaoRestosAPagar`.
- Inscrição: lê o roteiro antes de gravar qualquer inscrição e lança por inscrição, na mesma transação.
- Os quatro atos de execução lançam também o par orçamentário quando ele estiver publicado.
- **Regra de ativação, sem meio-termo:** o controle orçamentário de RP liga quando os seis eventos têm
  par orçamentário publicado. Com qualquer um faltando, nenhum lança, e a tela diz o que falta. Isso
  impede o saldo eterno.
- Regularização: os exercícios já encerrados recebem a inscrição pelo saldo vivo de cada RP, com
  lançamento datado na regularização, idempotente pela inscrição.
- Oráculo independente do teste: Σ das inscrições por tipo = saldo de `6.2.2.1.3`/`.03` em 31/12 antes
  da virada. N=2 (um RPNP e um RPP). Mutação: tirar a perna da liquidação de RP e ver `6.3.1.1` ficar
  com saldo depois do pagamento total.

**B. Manter o desenho atual e marcar a ausência.** O RP segue controlado pelo razão próprio
(`MovimentoRestosAPagar`), e a MSC fica sem o controle 5.3/6.3. É coerente, mas não atende o PCASP
nem a IC "AI" no saldo inicial.

## O que falta para executar A

1. As contas analíticas 5.3/6.3 do plano carregado, por tipo, escolhidas pelo contador. Elas entram
   pela tela de roteiros de restos a pagar, que já existe e passa a ter o terceiro par.
2. Nenhuma outra decisão: a ordem em relação à virada é dada (a inscrição lança antes do encerramento
   das classes 5/6, dentro da mesma transação do encerramento).

## Decisão

Não construída na V28. Fica registrada aqui com o desenho da opção A pronto. A construção é uma unidade
própria do M08: migration, quatro serviços, tela de roteiros e regularização.
