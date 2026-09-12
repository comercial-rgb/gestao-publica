# Caracterização de M01 e M05 — o que a base JÁ faz, medido antes de ampliar

> Exigido pelo ENT01 §2.2 ("caracterizar antes de ampliar"). Escrito a partir da
> leitura dos dois `MODULO.md` e da execução das suítes, não de suposição.
>
> Baseline registrado: `npx vitest run modules/m01-core-contabil modules/m05-despesa`
> → **11 arquivos, 97 testes, 97 passando, 42,85 s** (2026-09-09).

## 1. Por que este documento existe

O ENT01 manda construir interface **sobre os casos de uso existentes**, e manda ler os
`MODULO.md` antes porque "eles explicam decisões revertidas e por que o código não é o
que se espera". Isso se confirmou: quatro das condutas abaixo são o oposto do que um
CRUD faria, e uma tela escrita sem saber disso teria pedido ao domínio coisas que ele
recusa de propósito.

## 2. As quatro condutas que o §2.2 manda registrar

### 2.1 Saldo de dotação — por movimento, nunca por incremento

`MovimentoDotacao` é a **fonte da verdade**; as quatro colunas de saldo da
`FichaOrcamentaria` são **cache**. O cache só é escrito como
`coluna = SELECT SUM(MovimentoDotacao…)`, dentro da MESMA transação que insere o
movimento. `saldo = saldo ± valor` é proibido: um UPDATE cego perde a corrida entre
transações concorrentes e o saldo derrapa em silêncio.

| Tipo de movimento | Balde | Sinal |
|---|---|---|
| `DOTACAO_INICIAL`, `CREDITO_ADICIONAL` | autorizado | + |
| `ANULACAO_CREDITO` | autorizado | − |
| `RESERVA` | reservado | + |
| `RESERVA_LIBERADA` | reservado | − |
| `EMPENHO` | empenhado | + |
| `EMPENHO_ANULADO` | empenhado | − |

`disponivel = autorizado − reservado − empenhado`. O `valor` é **sempre positivo** — o
sinal vem do tipo, para que não exista movimento negativo escondendo uma anulação.

**Data:** não há saldo "em data informada" no M05. Toda leitura de saldo é a posição
**atual** derivada dos movimentos; o corte temporal do repositório é a `dataTransacao`
do lançamento, no razão. Consequência para T03: a coluna "saldo" da tela de dotações é
**atual**, e uma consulta a saldo em data passada tem de ser feita pelo razão
(`dotacao-razao.ts` / A1-orc), não pela ficha. Declarar as duas como a mesma coisa seria
inventar uma semântica que o domínio não tem.

**Fail-closed (TR 4.51):** reserva ou empenho sem disponível suficiente é **rejeitado**,
e a checagem lê o **SUM real dentro da transação** — nunca a coluna cache, que por
definição pode estar suja. `reconciliarFicha(fichaId)` compara cache × SUM e tem de dar
`[]` sempre.

### 2.2 Geração de lançamento por evento — o roteiro vem do chamador, as contas do M01

Nenhum módulo grava no razão direto: todos passam por `registrarLancamento` /
`estornarLancamento`. O roteiro (quais contas cada fato debita e credita) é **parâmetro**,
não constante escondida.

| Fase | PATRIMONIAL | ORÇAMENTÁRIO | CONTROLE (DDR) |
|---|---|---|---|
| Empenho | *(nenhum — a despesa ainda não foi incorrida)* | D crédito disponível / C crédito empenhado | D 8.2.1.1.1 / C 8.2.1.1.2.01 |
| Liquidação | D variação diminutiva / C obrigação a pagar | D crédito empenhado / C crédito liquidado | D 8.2.1.1.2.01 / C 8.2.1.1.3.01 |
| Pagamento | D obrigação a pagar / C disponibilidade | D crédito liquidado / C crédito pago | D 8.2.1.1.3.01 / C 8.2.1.1.4.01 |

O empenho **não** gera fato patrimonial — quem gera é a liquidação, quando a obrigação
com o fornecedor passa a existir. O crédito de cada estágio orçamentário é o débito do
seguinte.

⚠️ **Dois donos do roteiro, e isso é dívida declarada.** `m05-despesa/dominio.ts` exporta
`roteiroEmpenho/Liquidacao/Pagamento` próprios, **sem** as pernas de DDR, e é deles que a
maioria das fixtures se serve; `m01/roteiros.ts` tem os de produção, **com** DDR.
Produção move a DDR; boa parte das fixtures, não (pendência `ROTEIRO-LEGADO-M05`).
Para as telas do ENT01 isso importa: a contagem de pernas de um pagamento difere
conforme o roteiro, e T08 tem de exibir o que o **fato** tem, nunca um número fixo.

**Fail-closed do rótulo (invariante f do motor):** o `subsistema` da perna é validado
contra o 1º dígito da conta — 1-4 patrimonial, 5-6 orçamentário, 7-8 controle. Antes
disso o rótulo era livre, e um rótulo torto fecha tão bem quanto um certo.

### 2.3 Estorno por perna — o ponto que o cenário de aceite protege

`gerarEstorno` produz um lançamento **novo** com o tipo de cada partida invertido,
**mantendo o valor de cada perna**. Não existe `estornadoPorId`: "já estornado?" é
derivado de `original.estornos.length > 0`. Um lançamento é estornado no máximo uma vez
(índice único parcial `uq_estorno_unico`).

⚠️ **A regressão que isto tranca já foi um bug real, e já está corrigida.** Os estornos
do M08 jogavam fora o valor de cada perna e recarimbavam um valor único
(`pagamento.valor`). Enquanto todo lançamento teve pernas iguais, foi invisível. Com a
retenção (M07) o lançamento virou **composto** — o caixa leva o líquido, as demais pernas
o bruto — e o estorno devolveria ao caixa 1.000 de um pagamento que desembolsou 900. O
balanço fecharia junto, porque as pernas continuam batendo entre si; só que todas erradas.
Trancado por `m08-anulacao-rp.test.ts`, o único teste do M08 com pernas desiguais.

**Anulação parcial é coisa diferente de estorno, e tem coluna própria:**

| Coluna | O que diz |
|---|---|
| `estornoDeId` | **NEGA** o fato: o original sai de toda soma líquida. |
| `anulacaoParcialDeId` | **REDUZ** o fato: o original fica, valendo menos. |

Gravar a parcial como estorno faria a fila do art. 141, o saldo do contrato, o superávit
por fonte e o empenhado da ficha responderem **zero** onde deveriam responder 1.500.
Isso resolve o teste 18 do ENT01 ("estorno parcial não é tratado como total por um
booleano") no nível do schema: não há booleano, há duas relações distintas.

⚠️ **Duas portas fechadas na anulação parcial**, e elas alcançam T05/T07: pagamento **com
retenção** e pagamento que **amortizou dívida** recusam anulação parcial — em ambos falta
definir de quem sai o pedaço. A tela tem de oferecer, nesses casos, anular o pagamento
inteiro e refazê-lo; oferecer o campo "valor a anular" e deixar o servidor recusar seria
propor ao usuário uma operação que não existe.

### 2.4 Período aberto — o corte é a data do FATO

`estaTravado(tx, dataTransacao, autor)` roda **dentro do funil `lancarNoRazao`**, uma vez
só. Como nenhum módulo escreve no razão por fora, a trava alcança toda escrita —
API, worker ou rota alternativa — sem que cada caso de uso precise lembrar dela.

O corte é a `dataTransacao`, a data do fato: travar janeiro trava os fatos de janeiro,
não o que foi digitado em janeiro. Um fato de dezembro digitado em janeiro pertence a
dezembro. É o mesmo corte que a MSC, a DVP e o Balanço usam para ler.

Eventos de travamento podem ser **globais** ou **por usuário** (`usuarioAlvo`).

## 3. Estado derivado, não gravado — o que a tela NÃO deve pedir

Não existe coluna `status` no `Empenho`, nem na `ReservaDotacao`, **de propósito**: para
o status andar seria preciso dar UPDATE, que é o que o append-only proíbe; um status
gravado na criação ficaria congelado em `EMPENHADO` para sempre. `statusDoEmpenho()` é
função pura sobre os SUMs, e a cadeia
`EMPENHADO → PARCIAL_LIQUIDADO → LIQUIDADO → PARCIAL_PAGO → PAGO` acontece sem um único
UPDATE — anular a liquidação faz o status **voltar** sozinho.

Consequência direta para T04/T05: a coluna "situação" é **calculada na leitura**. Não há
o que filtrar por `status` no banco, e uma tela que quisesse ordenar por situação tem de
calcular antes de paginar — ou paginar por outra coluna.

## 4. Guards que a interface tem de respeitar (e não pode contornar)

| Guard | Onde | O que recusa |
|---|---|---|
| Saldo da ficha | M05, dentro da transação | Reserva/empenho sem disponível (SUM real, não cache) |
| Fonte da conta bancária | `guard-fonte.ts` | Pagar despesa de uma fonte com dinheiro de outra conta |
| Fonte da **ficha** | `guard-fonte.ts` | O elo que faltava: `pagamento → liquidação → empenho → ficha → fonte` |
| Limite do nível de baixo | M05 | Liquidar > empenhado; pagar > liquidado |
| Sem órfão | M05 | Anular liquidação que ainda tem pagamento vivo |
| Contrato | M11, dentro da transação do empenho | Existe → homologado → vigente → cabe no saldo → categoria herdada |
| Identidade | M16, no funil | `criadoPor` que não é usuário **cadastrado e ativo** |
| Autorização por UG | M16 | Ação fora da unidade gestora do perfil |
| Travamento | M16, no funil | Fato em competência fechada |

O `guard-fonte` mora num arquivo avulso porque tem **dois** chamadores: o `pagar()` do
M05 e o pagamento de restos a pagar do M08, que cria o `Pagamento` por conta própria. É o
lugar onde a troca de fonte é mais tentadora — o exercício virou, a conta mudou.

## 5. O que NÃO existe, e o ENT01 pede

| O que o ENT01 pede | Estado na base |
|---|---|
| T02 — pessoas e credores | **Não existe.** O credor é `Empenho.credorCpfCnpj`, uma **string** solta, com índice. Não há cadastro, papéis, relações nem histórico de pessoa. |
| Município como dimensão | **Não existe, e é decisão em aberto.** `EnteConfig` é singleton por PK ("sempre `unico`"). Ver §6. |
| Entidade gestora | Existe como `UnidadeOrcamentaria`, com `tipoUnidade` (01 Prefeitura, 02 Câmara, 04 Sec. Saúde, 05/07 RPPS…) — exatamente as entidades do cenário de aceite. |
| Exercício | Existe (`Exercicio.ano`, com `EncerramentoExercicio`). |
| Contexto por usuário | **Já existe e não é mock:** `lib/portas/contexto.ts` devolve exercícios e UGs autorizadas, derivadas de `PermissaoDePerfil`, fail-closed (sem permissão = lista vazia, nunca "todas"). |
| Retenção no pagamento | Existe (M07), composta e balanceada, com as pernas desiguais que o cenário exige. |

## 6. A dimensão que falta, e por que este lote não a inventa

O `CONTEXTO-SIAFIC-E-SAAS-MUNICIPAL.md` do pacote registra que a escolha entre produto
único e dois produtos **"precisa ser tomada por quem conhece o objetivo comercial — não
dá para inferir do código"**, e lista "ganhar multi-tenancy" como um caminho inteiro
(caminho 2), não como um detalhe de tela.

Nesta base, `EnteConfig` é singleton, o escopo de permissão é `ENTE | UG`, e nenhuma das
115 tabelas tem coluna de tenant. Acrescentá-la é reescrita transversal — não é o que o
ENT01 chama de "criar o caso de uso na camada correta".

**O que este lote entrega, então:** o eixo **entidade gestora (UG) × exercício**, que
existe, é o eixo de segregação real do sistema (TR 6.5) e é onde os testes de isolamento
têm alvo verdadeiro. O eixo **município** fica declarado como pendência de decisão, e os
cenários do §4 da especificação que dependem dele ("Município A não lê dados de B") são
implementados na granularidade que a base tem: **unidade A não lê nem escreve na unidade
B**, com o papel real da aplicação.

Isto está registrado como pendência aberta, não como item atendido.
