# Encerramento anual com anulação parcial: ensaio em banco isolado (V34)

Este documento registra o ensaio do encerramento anual feito na V34 e a configuração usada nele. A configuração é de
ensaio: não é a decisão de Esperança.

O teste é `modules/m08-restos-a-pagar/m08-encerramento-cadeia.test.ts` e roda em banco isolado.

## A cadeia exercida

1. Arrecadação de 8.000.
2. NE-1 de 10.000:
   - liquidação parcial NL-1 de 6.000;
   - pagamento parcial NP-1 de 3.000;
   - anulação parcial do empenho de 1.000, viva;
   - anulação parcial do empenho de 500, estornada;
   - anulação parcial da liquidação de 800;
   - anulação parcial do pagamento de 300.
3. NE-2 de 2.000, liquidado e pago por inteiro.
4. Encerramento de 2026 com inscrição de restos.
5. Apuração do resultado.
6. Virada das contas de controle.
7. Abertura de 2027.
8. Pagamento de 1.000 do resto processado.

## Conferido em cada passo

- **Antes do encerramento:**
  - caixa 3.300;
  - fornecedores 2.500;
  - VPD 7.200 e VPA 8.000;
  - a liquidar 3.800, a pagar 2.500 e pago 4.700.
- **Inscrição de restos:**
  - NE-1 não processado: 3.800;
  - NE-1 processado: 2.500;
  - NE-2: nada a inscrever.
  - O inscrito é igual ao saldo dos controles do razão.
- **Apuração do resultado:**
  - superávit de 800 nos resultados acumulados;
  - classes 3 e 4 zeradas.
- **Virada das contas de controle:**
  - as contas 5 e 6 do exercício ficam zeradas;
  - caixa e fornecedores atravessam para 2027.
- **2027:**
  - saldo do resto processado: 1.500;
  - fornecedores 1.500 e caixa 2.300.

Uma mutação que tira da família o estorno da anulação parcial faz a inscrição falhar no teste.

## Três naturezas de regra

| Natureza | O quê | Onde |
|---|---|---|
| Regra técnica (código) | processado = liquidado − pago; não processado = empenhado − liquidado; a família de cada fato pela régua dos estornáveis; a apuração zera as classes 3 e 4 contra a conta de resultado; a virada zera as contas classificadas ENCERRA | `encerramento.ts`, `dominio.ts`, `apuracao.ts`, `encerramento-controles.ts` |
| Roteiro oficial | a autorização, a previsão e a execução do exercício encerram com ele (CF art. 167, II; anualidade; MCASP Parte IV); os restos inscritos atravessam (Lei 4.320, art. 36) | justificativas em `m08-encerramento-controles.test.ts` (DESTINOS) e `MODULO.md` do M08 |
| Configuração municipal | qual é a conta de resultados acumulados (`RoteiroEncerramento`) e o destino de cada conta 5 e 6 na virada (`ContaNaVirada`) | telas Contabilidade › Roteiros e Contabilidade › Virada dos controles |

## A configuração de ensaio usada

- **Resultados acumulados:** conta de teste `2.3.7.1.1.00.00`. O seed oficial, `prisma/seed/roteiro-encerramento.ts`, usa `2.3.7.1.1.01.00`.
- **Virada:** ENCERRA para as contas abaixo, com a justificativa do MCASP:
  - dotação inicial e adicional;
  - crédito disponível e reservado;
  - empenhado a liquidar;
  - liquidado a pagar e pago;
  - receita a realizar e realizada.
- O par de controle dos restos (5.3 e 6.3) não entra: a inscrição ainda não lança no razão.

## O que continua pendente

- **Inscrição de restos sem perna no razão (5.3 e 6.3):** é a opção A de
  `docs/varreduras/varredura-v28-controle-orcamentario-dos-restos.md`, que não foi construída. Por isso o empenhado a
  liquidar e o liquidado a pagar chegam à virada com o saldo dos restos e encerram. O saldo dos restos continua no
  razão próprio (`MovimentoRestosAPagar`).
- **Configuração de Esperança:** a classificação de cada conta na virada e a conta de resultados acumulados são
  decisão do ente, a declarar pelas telas na implantação.

## Diagnóstico de produção

A consulta é `docs/operacao/DIAGNOSTICO-RESTOS-ANULACAO-PARCIAL.sql`. Ela é somente leitura e não grava nada.

Para cada exercício encerrado, ela:
1. recalcula os restos pela regra atual, só com as linhas gravadas até o instante do encerramento;
2. compara o resultado com o valor inscrito;
3. lista cada diferença com o valor esperado e o valor registrado.

**Onde foi validada:**

| Banco | Resultado |
|---|---|
| Ensaio local da V33 | 0 diferenças, sem anulações parciais |
| Clone com um valor inscrito alterado | acusa 1,00 |
| Banco deste ensaio (duas parciais de empenho, uma estornada; uma de liquidação; uma de pagamento) | 0 diferenças: o recálculo da consulta é igual ao inscrito pelo código |

**Não foi executada na produção:** não há autorização direta registrada para ler o banco de produção.

Se rodar e encontrar diferença, a saída é uma relação dos fatos com o valor esperado e o valor registrado. A
regularização é proposta à contabilidade do ente: cancelamento ou complemento da inscrição pelos atos do M08. Nada
deve ser reescrito nem ajustado em silêncio.
