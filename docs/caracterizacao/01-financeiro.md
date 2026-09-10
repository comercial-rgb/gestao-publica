# Caracterização do bloco financeiro — o comportamento atual, antes do ENT03

> Medido em **2026-09-10**, com o banco quieto e a trava da suíte tomada.
> Este documento registra o que o código **faz**, não o que deveria fazer.
> Cada afirmação tem um teste que falha se o comportamento mudar:
> `test/caracterizacao/financeiro.test.ts` (15 testes).

## 1. A suíte dos oito módulos

```
$ npx vitest run modules/m01-core-contabil modules/m04-receita modules/m05-despesa \
    modules/m06-ordem-cronologica modules/m07-extraorcamentario \
    modules/m08-restos-a-pagar modules/m12-relatorios modules/m14-exports-federais

 Test Files  61 passed (61)
      Tests  647 passed (647)
   Duration  190.52s
```

**61 arquivos, 647 testes, 0 falhas.**

⚠️ **Isto encerra a dúvida de 2026-09-09.** Naquele dia estes mesmos oito módulos
apareceram com **13 falhas** e a suíte levou 107 minutos. A leitura apressada teria sido
"há defeitos no financeiro" — e teria mandado alguém procurar defeito onde não havia. A
causa era **duas execuções do Vitest disputando o mesmo banco de teste**: a limpeza de uma
apagava a semente da outra no meio do teste.

Com o banco quieto e a trava tomada (`test/trava-da-suite.ts`, ENT02), os mesmos arquivos
passam em 190 s. **Nenhuma das 13 era defeito.**

## 2. Os quatro invariantes do núcleo — já cobertos, e não duplicados

O prompt pede "confirmar os quatro invariantes com teste que os viole de propósito e
espere rejeição". Eles **já existem** em `test/invariantes-nucleo.test.ts` — **16 testes,
todos verdes**. Escrever um segundo arquivo seria criar a segunda verdade sobre a mesma
promessa.

| Invariante | Onde | O que a violação recebe |
|---|---|---|
| 1 · dinheiro sem `Decimal` | `invariantes-nucleo` 37-84 | recusa; e o teste mostra que o float desbalancearia um lançamento que em `Decimal` fecha |
| 2 · `UPDATE`/`DELETE` em lançamento | idem 234+ | o modelo **não oferece** campo de mutação — estorno é registro novo |
| 3 · entrada duplicada sem idempotência | idem 181-233 | recusa por `(fonte, chaveIdemp)`; a mesma chave em fontes diferentes convive |
| 4 · lançamento desbalanceado por subsistema | idem 85-114 | recusa o que fecha no total e não fecha por subsistema |
| 4b · guard de subsistema × 1º dígito do PCASP | idem 115-157 | recusa classe 1 como `ORCAMENTARIO`, classe 5 como `PATRIMONIAL`, classe 9 (fora das oito) — e **aceita** 7/8 como `CONTROLE` |

⚠️ O guard 4b **permite o certo**, e não só barra o errado. Um guard que só recusa passa
despercebido quando fica restritivo demais; este tem o teste do caminho feliz junto.

## 3. Os cinco comportamentos que o ENT03 vai tocar

### 3.1 ⚠️ Saldo de dotação por data — **não existia; resolvido em ENT03a**

> **ATUALIZAÇÃO DE 2026-09-10.** O que esta seção descreve foi **corrigido** no ENT03a,
> pela alternativa A de `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`. O texto
> abaixo fica como está — é o registro do que o sistema fazia, e é dele que a decisão
> saiu. O que mudou está no fim da seção, em **"O que aconteceu depois"**.

**Este é o achado que mais muda o planejamento do lote.**

`saldosDaFicha(fichaId, deps)` tem **dois parâmetros e nenhum é temporal**. Por baixo,
`totaisPorTipo` agrupa `MovimentoDotacao` por `tipo` com `where: { fichaId }` e mais nada.

E a causa é estrutural, não uma consulta que faltou:

> **`MovimentoDotacao` não tem data de competência.** Tem `criadoEm` — o instante em que a
> linha foi gravada, não a data do fato.

A diferença é exatamente o que quebra um corte temporal: um decreto de crédito adicional
com data de **20/06**, lançado no sistema em **15/07**, tem `criadoEm` de julho. Perguntar
"qual era o saldo em 30/06?" filtrando por `criadoEm` daria a resposta errada, **e daria em
silêncio**.

⚠️ **E o empenho TEM `data`.** `modules/m05-despesa/consultas.ts` corta por ela
(`data: { lte: corte }`). A assimetria é real, e é a armadilha: quem vir o corte funcionando
no empenho pode supor que funciona na dotação também.

**Consequência para o ENT03:** cotas de despesa por período (2.5), contingenciamento e
prévia de alteração orçamentária **dependem de saldo por data**. Nenhum deles se constrói
sobre `saldosDaFicha` como ela está. Ou se acrescenta competência a `MovimentoDotacao` — uma
migration que muda o significado de todos os saldos — ou se deriva o corte de outra fonte. É
uma decisão de desenho, e ela precisa ser tomada **antes** de escrever a primeira cota.

*Testes: `c1`, `c2`.*

#### O que aconteceu depois

A decisão foi tomada (ADR aceito, alternativa A) e implementada no ENT03a:

- `MovimentoDotacao` ganhou `competencia` e `competenciaDerivada`, em migration aditiva
  de três passos (nullable → backfill → `NOT NULL`), sem `DROP`;
- o backfill recuperou a data do fato do próprio razão (`LancamentoContabil.dataTransacao`
  da perna do movimento) e de `Empenho.data` — **zero linhas caíram no caso derivado**;
- `saldosDaFicha` **foi retirada**. No lugar entraram `saldosCorrentesDaFicha`,
  `saldosDaFichaPorCompetencia` e `saldosDaFichaPorRegistro`. A assinatura antiga não
  ganhou um terceiro parâmetro opcional, de propósito: um opcional deixaria todo chamador
  respondendo pelo eixo antigo sem que ninguém decidisse isso;
- um guard novo (`exigirCompetenciaEmExercicioAberto`) recusa movimento cuja **competência**
  caia em exercício encerrado — vetor que `exigirExercicioDaFichaAberto` não via, porque
  ele olha o exercício da ficha e não o do fato.

⚠️ **E a medição confirmou o defeito no dado real.** No banco de desenvolvimento havia doze
empenhos com `Empenho.data` de **10/04** e `criadoEm` de **09/09** — cinco meses. Um corte
por `criadoEm` em 30/06 teria respondido que nenhum deles existia.

⚠️ **O c2 antigo NÃO teria pego esta mudança.** Ele afirmava, no docblock, vigiar a chegada
de uma coluna de competência, mas a asserção era `nomes.filter(/^data/i)` — e a coluna
criada chama-se `competencia`. Teria passado verde sobre exatamente o que dizia vigiar. O
c2 atual afirma o **conjunto exato** de colunas: sobra e falta acusam igual.

### 3.2 Geração de lançamento por evento — o roteiro é **parâmetro**, não tabela

`empenhar(params, ROTEIRO, deps)` recebe o roteiro contábil de fora. Não há tabela que
mapeie evento → partidas; quem chama diz quais contas usar, e `validarLancamento` recusa o
que não fecha.

Existem duas tabelas com "evento" no nome, e **nenhuma é roteiro**:

- **`EventoLimitacaoEmpenho`** (M02) — o contingenciamento, append-only: cada linha LIGA ou
  DESLIGA a limitação de um exercício, e a vigente é a última por `criadoEm`.
  ⚠️ **Achado útil:** o item 2.5 do ENT03 pede contingenciamento com liberação. A base já
  existe — construir outra seria o segundo caminho para o mesmo fato.
- **`EventoFiscalOutbox`** (base) — fila de saída das integrações, com
  `@@unique([destino, chaveIdemp])`. Idempotência de transmissão, não roteiro.

**Consequência para o ENT03:** cada evento novo de 2.4 (convênio, precatório, dívida
fundada, PPP) traz o seu roteiro **no código que o chama**. A alternativa — tabela de
eventos configurável — é uma reescrita do M01, e o prompt proíbe reescrever o ledger para
acomodar funcionalidade nova.

*Teste: `c3`.*

### 3.3 Estorno por perna — cada perna preserva o seu valor

`gerarEstorno` inverte `DEBITO ↔ CREDITO` **perna a perna**, preservando conta, subsistema e
**o valor daquela perna**.

Provado com um pagamento com retenção (bruto 1000, líquido 900, retido 100): o estorno sai
com 1000, 900 e 100 nos lugares certos. **Nada é recarimbado** — que é o que o prompt cobra
em 3.

Outras três propriedades registradas:

- **estornar duas vezes é recusado** (`original.estornos` não vazio);
- **a data do estorno é a do ATO**, não a do fato original — é ela que decide em que período
  o estorno cai, porque o travamento e os relatórios cortam por `dataTransacao`;
- ⚠️ **anulação parcial de lançamento COMPOSTO é porta fechada, de propósito.** Reduzir
  proporcionalmente um pagamento com retenção exigiria decidir de quem sai o pedaço anulado
  — do fornecedor ou do INSS — e a resposta não está no lançamento. O motor recusa nomeando.
- **a anulação parcial não é estorno**: não marca `estornoDeId`, e por isso um fato pode ser
  reduzido várias vezes até o saldo acabar.

**Consequência para o ENT03:** a tentação de "anular parcialmente um item do lote de
pagamento" vai aparecer em 2.2. A porta está fechada e o motivo está escrito.

*Testes: `c4`, `c5`, `c6`, `c7`.*

### 3.4 ⚠️ Ordem cronológica — o domínio **relata**; quem bloqueia é o serviço

A fila ordena por **data de liquidação** (a exigibilidade do art. 141, caput), desempatando
pelo número da liquidação — duas liquidações do mesmo dia precisam de ordem **total**, senão
"a cabeça da fila" é ambígua e a regra vira loteria.

`avaliarOrdem` devolve `{ ehCabecaDaFila, posicao, preterida }`. **Ela não estoura.**

> **Isto é o ponto para o teste 4 do ENT03** ("pagamento em lote respeita ordem cronológica;
> rota alternativa não a contorna"): a garantia **não está no domínio puro**. Está em quem o
> chama. Um lote de pagamento novo que não passasse pelo serviço certo furaria a regra
> **sem que nada no M06 acusasse**.

Registrado também: pagamento parcial **não tira da fila** — a liquidação continua na posição
da data original até ser quitada. Se saísse, bastaria pagar R$ 0,01 a cada credor para
desmontar a ordem inteira.

*Testes: `c8`, `c9`, `c10`, `c11`.*

### 3.5 Encerramento de exercício — fato append-only, cobrado no caso de uso

"Encerrado" é **derivado** da existência de um `EncerramentoExercicio`. Não há coluna
`status` nem `encerrado` em `Exercicio` — uma coluna exigiria `UPDATE`, e encerrar é um FATO
(quem encerrou, quando), não um atributo.

O guard `exigirExercicioAberto` recusa **duas** situações:

- exercício **encerrado**;
- exercício **inexistente** — e não o cria na hora. Um erro de digitação (2062 em vez de
  2026) viraria um exercício novo em silêncio, com orçamento próprio e sem lei por trás.

E ele é cobrado **dentro da transação do caso de uso**: empenhar num exercício encerrado é
recusado e **nada fica gravado** (medido: contagem de empenhos antes = depois).

⚠️ **O lançamento carrega `dataTransacao`, distinta de `criadoEm`** — e é por ela que os
cortes acontecem. Isto fecha o círculo com 3.1: **o lançamento tem data de competência; a
dotação não tem.**

*Testes: `c12`, `c13`, `c14`, `c15`.*

## 4. O que a caracterização mudou no plano do lote

| Achado | Efeito |
|---|---|
| Saldo de dotação **não tem corte por data** | cotas, contingenciamento e prévia de alteração (2.5) precisam de uma decisão de desenho **antes** da primeira linha |
| `EventoLimitacaoEmpenho` **já existe** | o contingenciamento não começa do zero — e criar outra tabela seria o segundo caminho para o mesmo fato |
| M06 **relata** em vez de bloquear | o teste 4 do lote tem de exercitar o **serviço**, não o domínio puro |
| Roteiro é parâmetro | cada evento novo de 2.4 traz o seu roteiro no chamador |
| Anulação parcial de composto é porta fechada | 2.2 não pode "anular parcialmente" um item de lote com retenção |

## 5. ⚠️ Correção a uma afirmação do handoff

O prompt do ENT03 trata como fato de projeto:

> "M09 tesouraria existe só como schema `.prisma`, sem módulo."

**Isso não é mais verdade.** Medido em 2026-09-10:

```
modules/m09-tesouraria/
  conciliacao.ts     351 linhas
  dominio.ts         350
  extrato.ts         164
  transferencia.ts   100
  vinculo.ts         497
  + 5 arquivos de teste (1607 linhas)
lib/portas/conciliacao.ts
packages/ofx/  (parser 333 linhas + 214 de teste)
```

O que **existe**: conciliação bancária, vínculo com estorno, importação de extrato (OFX e
retorno BB), transferência entre contas, e o parser OFX próprio com teste.

O que **falta** de 2.2: lote de pagamento, borderô, e movimentação bancária (depósito,
aplicação, resgate) com **saldo por fonte**. `ContaBancaria` mora em `m05-despesa.prisma` e
já tem `fonteId`.

É exatamente o que o prompt manda fazer — "verificar um a um; parte pode estar dentro de
M05, M07 ou M17; complete a lacuna sem criar um segundo caminho para os mesmos fatos".
O inventário acima é essa verificação.
