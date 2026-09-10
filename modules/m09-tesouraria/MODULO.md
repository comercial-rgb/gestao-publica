# M09 — Tesouraria

> Conciliação bancária, vínculo, importação de extrato, transferência entre contas,
> **lote de pagamento e borderô**.

## 1. ⚠️ Correção a uma afirmação do handoff

O prompt do ENT03 trata como fato de projeto:

> "M09 tesouraria existe só como schema `.prisma`, sem módulo."

**Não é verdade desde antes do ENT03.** Medido em 2026-09-10, antes de escrever qualquer
linha nova:

| Arquivo | Linhas | O que é |
|---|---:|---|
| `vinculo.ts` | 497 | vincular extrato × razão, com estorno |
| `conciliacao.ts` | 351 | a conciliação bancária propriamente |
| `dominio.ts` | 350 | regras puras: sinal, saldo, hash, período |
| `extrato.ts` | 164 | importação de OFX e de retorno BB |
| `transferencia.ts` | 100 | transferência entre contas da mesma UG |
| 5 arquivos de teste | 1607 | contra banco de verdade |

Mais `lib/portas/conciliacao.ts` e `packages/ofx` (parser de 333 linhas + 214 de teste).

**O que faltava de 2.2**, e é o que este lote acrescentou: **lote de pagamento**,
**borderô** e **retorno bancário**.

O que continua faltando: **movimentação bancária** (depósito, aplicação, resgate) com
controle de saldo **por fonte** no momento da operação. `ContaBancaria` já tem `fonteId` e
`contaContabilId`; o fato de movimentação não existe. Pendência `TESOURARIA-MOVIMENTACAO`.

## 2. O lote de pagamento — ele AGRUPA, não recria

⚠️ **A verificação veio antes do modelo**, como o prompt manda. O que já existia:

- `OrdemDePagamento` (M05) — a autorização individual, uma por liquidação, com conta
  bancária, fonte, data prevista e estado **derivado** de movimentos;
- `MovimentoExtraorcamentario` (M07) — a nota extra, com conta bancária própria;
- `ContaBancaria` (no schema do M05) — com fonte e conta contábil.

Por isso `ItemDoLote` **aponta** para a ordem ou para a nota. Ele não copia valor, credor
nem conta: um lote que carregasse cópias seria a segunda verdade sobre o pagamento, e
divergiria no dia em que a ordem fosse cancelada e o lote não soubesse.

**Quem paga continua sendo o M05.** O lote organiza a remessa ao banco; ele não é uma
segunda rota de pagamento.

### ⚠️ A ordem cronológica é conferida na INCLUSÃO — e por quê

A caracterização (`docs/caracterizacao/01-financeiro.md`, 3.4) registrou que `avaliarOrdem`
(M06) **relata** a quebra e **não bloqueia**: quem bloqueia é quem chama. Um lote que não
chamasse o guard furaria o art. 141 **sem que nada no M06 acusasse**.

`incluirNoLote` é o "quem chama". Ele monta a mesma fila que o pagamento individual
consulta — por (fonte, categoria), só com saldo a pagar — e recusa quem não é a cabeça,
nomeando a preterida.

**⚠️ E este guard nasceu errado.** A primeira versão não descontava da fila os itens já
incluídos em lote vigente, e o efeito era um lote **impossível de compor**: incluída a
liquidação de 01/03, a de 02/03 era recusada por quebra de ordem — porque a primeira
continuava com saldo a pagar (incluir no lote não paga). Duas liquidações da mesma fonte
nunca caberiam na mesma remessa, que é o caso comum.

O art. 141 protege quem está sendo **preterido**. Uma liquidação já comprometida na mesma
remessa não está sendo preterida — vai ser paga junto. **Lote cancelado não conta**: senão
bastaria criar um lote, cancelá-lo, e a liquidação antiga ficaria fora da fila para sempre.

Só apareceu porque o teste tinha duas liquidações. Com uma só, o guard passaria por
vacuidade e o defeito iria para produção.

## 3. O borderô

### ⚠️ Ele não guarda "assinado"

`Bordero.filaAssinaturaId` aponta para uma `FilaDeAssinatura` do **M22** (ENT02), e "tem
todas as assinaturas?" é lido **de lá**. Um booleano local poderia dizer "assinado" sobre
uma fila incompleta — e o dinheiro sairia.

⚠️ **`estadoDasAssinaturas` trata fila VAZIA como incompleta, explicitamente.**
`[].every(...)` devolve `true` em JavaScript: sem o `length > 0`, um borderô sem signatário
nenhum passaria por "todas as assinaturas colhidas". É por isso que `zGerarBordero` exige
`min(1)` — o "**nem gerado**" do teste 5 do lote.

### ⚠️ O borderô é um DOCUMENTO de verdade

O texto canônico — o mesmo de que sai o `hashConteudo` — é gravado como `Anexo` de origem
`SISTEMA`. Três coisas vêm de graça, e nenhuma precisou de código novo:

- é **baixável** pela rota do ENT02, com autorização por registro;
- é **assinável** pela fila do M22;
- a **conferência de integridade** do `lerArquivo` passa a valer para ele.

A alternativa era afrouxar a fila para aceitar assinatura sem anexo. Seria pior: o
`hashConteudo` de uma assinatura só significa algo se houver conteúdo a que corresponda —
uma fila sem anexo produziria assinaturas sobre o nada.

Isso obrigou a distinguir dois róis de MIME (`MIMES_ACEITOS` × `MIMES_GERADOS_PELO_SISTEMA`).
Não é um buraco: `MIMES_ACEITOS` protege contra o que entra **de fora**, e um documento que
o sistema montou byte a byte não corre esse risco. O `attachment` + `nosniff` do download
continua valendo para os dois.

### ⚠️ O envio é INDISPONÍVEL, e a ORDEM das conferências importa

`enviarBordero` **sempre recusa**: não há convênio bancário configurado. Mas ele confere as
**assinaturas primeiro**.

Se o "indisponível" viesse antes, o guard de assinatura nunca seria exercitado — e no dia
em que o convênio existisse, o borderô sem assinatura seria transmitido por um caminho que
nenhum teste tinha percorrido.

Por não gravar nada, `enviarBordero` está em `FORA_DO_CENSO` do M16, com o motivo: uma ação
para ele seria uma permissão concedida a alguém para fazer nada — e que ficaria distribuída
no dia em que o canal existisse, sem ninguém ter decidido isso.

## 4. O retorno bancário

⚠️ **A idempotência é do banco, não de um `if`.** `BaixaDeRetornoBancario` tem
`@@unique([itemId])`: reprocessar o mesmo arquivo encontra a linha e a pula. Um
`if (jaBaixado)` lido antes do insert perderia a corrida entre dois processamentos
simultâneos — os dois leriam "não baixado" e os dois gravariam.

E item de **outro** borderô é recusado: um retorno que baixasse item alheio marcaria como
pago o que o banco não liquidou.

## 5. Decisões que valem repetir

| Decisão | Por quê |
|---|---|
| Nenhuma coluna `situacao` | o estado do lote e do borderô é derivado dos movimentos, append-only — como o processo (M21) e o comunicado (M23) |
| `@@unique([ordemId])` no item | a mesma autorização não vai ao banco duas vezes; o segundo borderô pareceria legítimo até o extrato chegar |
| Lote vazio não fecha | um borderô sem linha seria transmitido como remessa válida, e só o extrato denunciaria |
| Uma conta por lote | um lote com duas contas viraria dois borderôs, para dois bancos |
| Ações próprias, não reuso de `PAGAR` | compor a remessa e autorizar o pagamento são atos de pessoas diferentes |
| Conteúdo canônico ordenado | duas gerações do mesmo lote dão o mesmo hash; sem isso "a assinatura confere?" não teria resposta estável |

## 6. Pendências declaradas

| Pendência | O que falta |
|---|---|
| `BORDERO-CONVENIO-BANCARIO` | transmissão real ao banco. O caso de uso RECUSA, nomeando |
| `TESOURARIA-MOVIMENTACAO` | depósito, aplicação e resgate com saldo por fonte no momento da operação |
| `LOTE-UI` | telas do lote e do borderô. Os casos de uso existem e são testados; não há superfície |
| `CONCILIACAO-COPIA-PENDENCIAS` | cópia de pendências não baixadas para o período seguinte (2.2) |

## 7. Onde olhar

| Arquivo | O que é |
|---|---|
| `lote.ts` | as regras puras: estado derivado, assinaturas, conteúdo canônico |
| `servico-lote.ts` | os guards, dentro da transação — inclusive a ordem cronológica |
| `m09-lote.test.ts` | 18 testes; cobre os testes 4, 5 e 6 do lote do ENT03 |
| `prisma/schema/m09-lote-e-bordero.prisma` | os modelos, e o porquê de cada FK |
