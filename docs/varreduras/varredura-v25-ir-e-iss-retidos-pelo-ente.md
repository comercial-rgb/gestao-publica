# V25 — o IR e o ISS retidos pelo próprio ente: receita, não consignação a recolher

Levantado em 01/10/2026, antes de construir. **Decisão pendente do contador do ente** — nada foi alterado
no código de retenção por causa disto.

## O que a norma diz

- **MCASP 11ª ed., Parte I, 3.6.2** (trecho literal em `docs/oficial/stn-sof/mcasp-11-irrf-trechos.txt`):
  o IR retido na fonte sobre o que o ente paga pertence a ele (CF, art. 158, I) e "deverá ser
  contabilizado como receita tributária", natureza 1.1.1.3.03.1.0 (IR Retido na Fonte — Trabalho). Não é
  transferência da União, porque o dinheiro não passa por ela.
- **MCASP 11ª ed., Parte III, 6.2.6** (precatórios): o roteiro do ente para o IRRF retido —
  D 1.1.2.1 Créditos Tributários a Receber / C 4.1.1.2 VPA (reconhecimento); na arrecadação
  D 1.1.1.1 Caixa / C 1.1.2.1, D 6.2.1.1 / C 6.2.1.2, D 7.2.1.1 / C 8.2.1.1.1.
- O ISS retido pelo município como tomador é imposto do próprio município: o mesmo raciocínio, natureza do
  ISS.
- **Leiaute SAGRES 2026 (TCE-PB)**: a retenção continua sendo informada no pagamento (§4.14 Retencao,
  tipo 1 ISS e tipo 2 IRRF, tabela de domínio §5.24), e a receita no §4.16 ReceitaOrcamentaria.

## O que o sistema faz hoje

- A retenção do pagamento grava um ingresso extraorçamentário numa consignação (passivo 2.1.8.8), e o
  "recolhimento" posterior é uma saída de banco a um credor. Para IR e ISS do próprio ente, o credor
  gravado é o próprio ente (`retencao-calculada.ts`), mas sem efeito contábil diferente.
- Resultado: se alguém "recolher" o IR ou o ISS pela tela, o dinheiro sai do caixa como se fosse de
  terceiro, e a receita tributária do ente nunca aparece na execução da receita, nem nos limites de
  saúde e educação que a usam como base.
- A folha calcula o IR dos servidores, mas não o contabiliza em lugar nenhum (nem consignação, nem
  receita).

## As duas cadeias possíveis

**A — a do manual, sem consignação.** No pagamento, a parte retida é reconhecida como crédito tributário e
VPA, e arrecadada como receita orçamentária, sem passar por passivo. O SAGRES §4.14 passa a ser lido de
outra fonte, que não o ingresso extraorçamentário.

**B — consignação e apropriação como receita.** A retenção continua indo para a consignação (como hoje, e
como o SAGRES lê), e um ato novo de apropriação baixa a consignação contra a receita orçamentária, sem
saída de banco: D 2.1.8.8 consignação / C VPA de impostos sobre a renda (ou do ISS), com a perna
orçamentária (6.2.1.1/6.2.1.2) e de controle (7.2.1.1/8.2.1.1.1) e a natureza da receita. É a prática
mais comum nos municípios da Paraíba.

O que já existe e serve às duas: o reconhecimento pelo fato gerador e a arrecadação vinculada do M04
(`modules/m04-receita/reconhecimento.ts`, `arrecadacao-vinculada.ts`), e as contas do plano oficial
1.1.2.1.1.01.01 (IR), 4.1.1.2.1.03.01/02 (VPA do IR, PF/PJ).

O que falta em qualquer uma: a marca "imposto do próprio ente" no tipo de consignação (tabela aditiva,
porque o papel do sistema não altera `TipoConsignacao`), a natureza de receita 1.1.1.3.03.x cadastrada no
ementário do ente e prevista na LOA, e o roteiro de reconhecimento por natureza (a tabela de roteiro hoje é
por origem e não distingue IR de IPTU).

## Para decidir

1. Cadeia A ou B.
2. Se o IR dos servidores, retido na folha, entra pela mesma cadeia.
3. Se o "recolhimento" pela tela deve recusar IR e ISS do próprio ente até a cadeia existir.
