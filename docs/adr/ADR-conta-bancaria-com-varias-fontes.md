# ADR — a conta bancária admite mais de uma fonte de recurso

- **Estado:** **aceito**
- **Data da decisão:** 2026-09-10
- **Decidida por:** Winner (proprietário do produto)
- **Contexto do lote:** levantada em ENT03a ao completar a tesouraria, decidida
  antes do fechamento do lote
- **Pré-requisito de:** `ADR-conciliacao-como-objeto-discreto.md` — a conciliação
  por fonte não faz sentido enquanto a conta só admite uma
- **Cláusula de origem:** 5.10.2.6

## Problema

A cláusula pede vínculo de uma **ou mais** fontes de recurso por conta bancária.
O modelo admite exatamente uma: `ContaBancaria.fonteId`, `NOT NULL`.

Isto foi marcado no catálogo como `AUSENTE_CONFIRMADO` durante o ENT03a, e a
marcação da ausência é o que trouxe a decisão para cá antes que alguém
construísse por cima.

## Por que não é cosmético

Município pequeno não abre uma conta por fonte. Uma conta única costuma abrigar
recurso ordinário, convênio e vinculado ao mesmo tempo — e o **controle de
destinação**, que é como se prova que recurso vinculado não custeou outra coisa,
acontece **dentro** da conta, não entre contas.

Com uma fonte por conta sobram duas saídas, e as duas são ruins:

1. **obrigar o ente a abrir uma conta por fonte** — o sistema impondo prática
   bancária a quem o contratou;
2. **deixar a fonte do movimento livre** — sem nada validando se aquela conta
   pode receber aquele recurso, que é justamente o controle que a cláusula pede.

⚠️ **E há uma armadilha já no repositório.** O ENT03a entregou o controle de
saldo por fonte no momento da operação (5.10.2.19), e ele funciona hoje **por
coincidência de modelagem**: como toda conta tem exatamente uma fonte, "saldo por
fonte" e "saldo por conta" são o mesmo número. Quem lesse o catálogo veria a
5.10.2.19 atendida e suporia o eixo resolvido. Ele não está.

## Alternativas

### A. Vínculo de muitos para muitos — **escolhida**

Uma tabela de vínculo `ContaBancaria × FonteRecurso`. A fonte única atual vira a
primeira linha.

- A favor: é o modelo que a cláusula descreve; a migration é aditiva; o dado
  existente é preservado sem interpretação.
- Contra: `fonteId` continua na tabela durante a transição, e duas fontes de
  verdade convivem por um tempo.

### B. Trocar `fonteId` por uma lista na própria conta

- Contra: não é relacional; nenhuma consulta por fonte fica indexável, e o guard
  do movimento passaria a varrer texto.

### C. Deixar como está e considerar a cláusula atendida

- Contra: seria marcar presença onde há ausência — exatamente o que o catálogo
  existe para impedir.

## Decisão

**Alternativa A**, com estas condições:

1. Vínculo **muitos-para-muitos** entre conta bancária e fonte, em **migration
   aditiva**. A `fonteId` atual de cada conta vira **a primeira linha** do
   vínculo — sem inventar nada e sem perder o dado.
2. O movimento bancário passa a **validar que a fonte informada está entre as
   permitidas para a conta**. Fonte fora do rol é recusada nomeando quais são as
   permitidas.
3. ⚠️ **A fonte continua OBRIGATÓRIA no movimento.** Conta com várias fontes não
   significa movimento sem fonte — significa **o oposto**: a fonte precisa ser
   declarada porque não dá mais para inferi-la da conta. Tornar o campo opcional
   aqui destruiria o controle de destinação em nome de conveniência de digitação.
4. O saldo passa a ser respondível **por conta** e **por conta × fonte**. O
   guard do saque continua sobre o saldo da fonte do movimento — que é o que
   impede recurso vinculado de custear outra coisa.

## O que NÃO se decide aqui

- **Não** se remove `ContaBancaria.fonteId` neste lote. Ela permanece como a
  fonte **padrão** da conta (usada quando o modelo de origem não tem conta, como
  a arrecadação do M04) e a remoção exigiria revisar cada leitura que a usa. A
  remoção é decisão separada, e o vínculo é o que passa a mandar no guard.
- **Não** se muda o M04 para ganhar conta bancária. A limitação já registrada em
  `caixa.ts` — arrecadação vinculada pela fonte, não pela conta — continua, e o
  comentário que a nomeia continua sendo o aviso.
