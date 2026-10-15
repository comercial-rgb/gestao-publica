# M28 — Convênios

Convênios em que o ente repassa (CONCEDENTE) ou recebe (CONVENENTE). Cadastro, liberação de parcela, aprovação de
prestação de contas, glosa e devolução, cada ato um `MovimentoConvenio` com lançamento de controle pelo roteiro
declarado na família CONVENIO (`RoteiroPatrimonialDeclarado`). Estorno é movimento novo.

## O que o código garante
- **Concedente liga o empenho; convenente liga a receita arrecadada** que trouxe a parcela. A receita precisa ser
  arrecadação em vigor, da fonte do convênio, arrecadada até o dia da liberação.
- **A mesma receita não explica duas vezes o mesmo dinheiro**, nem dentro de um convênio nem entre convênios: a soma
  das liberações vivas ligadas a ela, mais a nova, não passa do arrecadado. A receita é travada (`ReceitaDoConvenio`)
  antes da soma. Teste: "a mesma receita em dois convênios" em `m28-convenios.test.ts`, com prova por mutação.

## Pendências
- **ROTEIRO-DE-CONVENIO-A-DECIDIR-PELO-CONTADOR.** Os roteiros de controle da família CONVENIO e a VPA da natureza
  1724.51 da base de ensaio R3 (`scripts/demonstracao/semear-massa-r3.mts`, seção 11) são parâmetros de ensaio
  escolhidos no plano do TCE-PB carregado, não decisão do ente. O contador decide os definitivos.
