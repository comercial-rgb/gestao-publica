# ADR — a conciliação bancária é objeto discreto, não estado cumulativo

- **Estado:** **aceito**
- **Data da decisão:** 2026-09-10
- **Decidida por:** Winner (proprietário do produto)
- **Contexto do lote:** levantada em ENT03a ao completar a tesouraria, decidida
  antes do fechamento do lote
- **Depende de:** `ADR-conta-bancaria-com-varias-fontes.md`
- **Cláusulas de origem:** 5.10.2.45, 5.10.2.46, 5.10.2.49, 5.10.2.52

## Problema

As cláusulas pressupõem conciliações **discretas**: pendência não baixada
*copiada para o período seguinte* (5.10.2.46), consulta de *períodos anteriores*
(5.10.2.49), consulta de *pendências baixadas* (5.10.2.52).

O modelo é **cumulativo**: `conciliacaoBancaria(conta, corte)` soma tudo com
`lte: corte`. Ele responde "o que está pendente agora" e **não tem o que listar**
quando se pergunta por junho.

## É o mesmo defeito da competência, e é a terceira vez

A derivação responde *"o que está em aberto neste instante"*. A pergunta que o
documento faz é *"qual foi a conciliação de junho"*. Uma não deriva da outra, e o
modelo cumulativo só sabe responder a primeira.

Conciliação bancária é **peça de prestação de contas**, mensal, que se encerra e
passa a ser fato. Descobrir em agosto um erro de junho **não reescreve junho** —
trata-se em agosto, com rastro.

## ⚠️ O que é derivável e o que não é

Esta é a distinção que evita criar uma segunda verdade:

| Informação | Natureza |
|---|---|
| Saldo contábil da conta no período | **derivável** do razão |
| Saldo do extrato | dado externo, importado |
| Quais fatos existem no período | **derivável** — é a fonte única de enumeração extraída neste lote (`caixa.ts`) |
| **Qual fato corresponde a qual linha do extrato** | **juízo humano — não derivável** |
| **Por que uma pendência permanece em aberto** | **juízo humano — não derivável** |
| Estado da conciliação e quem a encerrou | **fato próprio** |

**O que se persiste é a coluna do meio.** Os saldos continuam derivados.

⚠️ **Congelar valores no encerramento criaria a segunda verdade**, e a tela de
conferência é o pior lugar do sistema para tê-la: ela existe justamente para
comparar duas fontes, e um valor congelado divergindo do razão faria o operador
conferir o sistema contra ele mesmo.

## Decisão

Conciliação como **agregado**: conta, período, estado (`ABERTA` | `ENCERRADA`) e
autoria do encerramento. Com estas regras:

1. **Enquanto ABERTA, as pendências continuam derivadas** pela álgebra que já
   existe. O que se persiste é a **decisão**: a correspondência entre fato e
   linha do extrato (o `VinculoConciliacao`, que já existe), e a **justificativa
   de cada pendência mantida**.

2. **Pendência manual é decisão registrada, não fato inventado.** Ela aponta o
   **motivo** e **não cria lançamento**. Uma pendência que gerasse lançamento
   seria um fato contábil nascido de uma anotação de tela — e o razão passaria a
   conter o que ninguém empenhou, liquidou ou pagou.

3. ⚠️ **"Cópia para o período seguinte" deixa de ser cópia.** A conciliação
   seguinte abre com o conjunto não resolvido da anterior como estado inicial,
   **por referência**. Duplicar a linha criaria dois registros da mesma pendência
   e **a soma passaria a contar duas vezes** — que é o oposto do que a
   conciliação existe para garantir.

4. **Conciliação encerrada é imutável**, como qualquer fato deste repositório.
   Correção posterior é tratada **no período em que foi descoberta**, com
   referência ao período de origem. Não há reabertura.

5. O estado **não é coluna de status mutável**: `ENCERRADA` é derivado da
   existência do fato de encerramento, como o exercício (M08), o lote (M09) e o
   processo (M21). Uma coluna exigiria `UPDATE`, e a tabela é append-only.

6. A regra que a extração de `caixa.ts` expôs — **o fato entra no lado interno
   quando moveu a conta contábil daquela conta** — permanece, e passa a valer
   **dentro do período** da conciliação.

## Consequência para o que já foi construído

**Nada do que o ENT03a entregou se perde.** A álgebra da conciliação e a fonte
única de enumeração de fatos continuam sendo o motor — a decisão só acrescenta o
**recipiente** que faltava para responder por período.

## ⚠️ O padrão a procurar, e não a coincidência

Três lotes, três achados da mesma família: **o modelo responde "agora" e o
documento pergunta "naquela data"**.

- ENT03 → `MovimentoDotacao` sem competência;
- ENT03a → a conta sem fonte múltipla;
- ENT03a → a conciliação sem período.

Vale tratar como **padrão a procurar**, não como coincidência. Os próximos
candidatos, nomeados aqui para que sejam verificados **antes** de construir:

- posição de estoque do almoxarifado (M10);
- saldo de contrato e de ata de registro de preços (M11);
- situação cadastral do imóvel e da empresa (M19/tributário);
- margem consignável do servidor (M12/folha).

**Quando um requisito disser "na data", verifique antes de construir se o modelo
tem o eixo.** É mais barato do que descobrir no meio da implementação, e foi o
que aconteceu nas três vezes.
