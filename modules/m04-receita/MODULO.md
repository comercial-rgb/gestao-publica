# M04 — receita

Execução da receita orçamentária: **arrecadação** e sua contabilização.

É o **primeiro consumidor real do ledger**: prova, no terreno mais simples, o
ciclo `fato → partidas balanceadas → lançamento append-only`. O roteiro contábil
daqui é o **embrião da Matriz de Eventos** (TR 5.91).

## Requisitos TR cobertos

- TR **4.58–4.69** — execução da receita (arrecadação, anulação).
- Layout SAGRES `ReceitaOrcamentaria`: natureza de receita (8 díg STN), fonte,
  CO, tipo de lançamento, valor, data, número da guia.

## Depende de

- **M01 core-contabil** — `criarPrismaClient()`, `ContaRepositoryPort` (plano de
  contas + regra da conta analítica), `IdPort`, e o `LancamentoContabil` onde a
  arrecadação é contabilizada.
- **M02 planejamento** — `NaturezaReceita`, `FonteRecurso`,
  `CodigoAcompanhamento`, `ReceitaPrevista` (para o confronto com a previsão).
  O adapter do M04 **delega** natureza+fonte ao adapter do M02.
- `packages/ledger` — `validarLancamento`, `gerarEstorno`.
- `packages/contracts` — `Money`/`Decimal`, `zMoney`.

## Invariantes (NUNCA violar)

1. **DINHEIRO = Decimal(18,2).** `zMoney` rejeita `number`; o valor cruza a
   fronteira do Prisma como string de 2 casas.
2. **APPEND-ONLY.** `ReceitaArrecadada` nunca sofre UPDATE/DELETE — sem
   `updatedAt`, sem `deletedAt`. Anulação = registro **NOVO** (`tipo =
   ANULACAO`) que referencia o original via `estornoDeId`. "Já foi anulada?" é
   **DERIVADO** da relação `estornos`, não de um campo mutável.
   Uma receita é anulada **no máximo uma vez** — garantia dura no índice único
   parcial `uq_estorno_receita_unico` (`prisma/sql/`), + recheck na transação
   para mensagem limpa.
3. **Toda arrecadação gera partidas BALANCEADAS**, validadas por
   `validarLancamento` **antes de qualquer I/O** — inclusive dentro de cada
   subsistema. Fail-closed: desbalanceado nunca é persistido.
4. **Código composto DERIVADO, nunca digitado** (padrão do projeto).
5. **Excesso de arrecadação NÃO é bloqueado.** Arrecadar acima do previsto é
   legítimo (vira fonte de crédito adicional). O serviço **SINALIZA** via
   `ConfrontoPrevisao` e **grava assim mesmo**. Barrar aqui seria inventar uma
   regra que a lei não tem.

## Roteiro contábil — sem conta mágica

Nenhuma conta PCASP é hardcoded no domínio. O roteiro chega **por parâmetro**:

```
PATRIMONIAL:   D disponibilidade      /  C variação patrimonial aumentativa
ORÇAMENTÁRIO:  D receita a realizar   /  C receita realizada
```

`roteiroArrecadacao({ disponibilidade, variacaoAumentativa, receitaARealizar,
receitaRealizada })` monta as 4 pernas a partir dos **papéis**, não dos códigos.
Cada subsistema fecha sozinho — é o que `validarLancamento` exige. Quando a
Matriz de Eventos existir, ela passa a ser a fonte destes roteiros; a assinatura
já comporta isso.

## Máquinas de estado

**Nenhuma** — `ReceitaArrecadada` é registro imutável. O que existe é a relação:

```
receita.estornos == []          => anulável
receita.estornos != []          => JÁ ANULADA, rejeita nova anulação
receita.tipo == ANULACAO        => não se anula uma anulação
```

## Decisões conscientes

- **`ReceitaClassificacaoPort` é port do M04, não do M02.** A
  `ClassificacaoRepositoryPort` do M02 só resolve natureza+fonte (para a receita
  PREVISTA); a arrecadação também tem CO. Acrescentar método à port do M02
  obrigaria a mexer no M02 e quebrar seus fakes. O **adapter** do M04 delega a
  parte natureza+fonte ao adapter do M02 — o reuso está lá, sem acoplar as ports.
- **`lancamentoId` é `@unique`**: um lançamento por receita (1-1). Reaproveitar
  um lançamento em duas receitas seria contabilizar o mesmo fato duas vezes.
- **`@@unique([exercicio, numeroReceita, tipo])`**: a mesma guia não é arrecadada
  duas vezes. O `tipo` entra na chave porque a ANULAÇÃO reusa o número da guia
  original.
- **Back-relations em M01/M02 são campos VIRTUAIS.** O Prisma exige o lado
  inverso da relação, mas eles **não geram coluna** — verificado no SQL da
  migration: só `CREATE TABLE` das tabelas novas + `ALTER TABLE
  "ReceitaArrecadada" ADD CONSTRAINT`. Nenhuma tabela do M01/M02 é tocada.

### Classificadores de natureza — o código é a verdade, a classificação é derivada

- **NÃO existe coluna `origem` nem `tipo` na `NaturezaReceita`, e não pode existir.**
  Seria a segunda verdade sobre o mesmo código: no dia em que ela divergisse do 2º
  dígito, o guard da operação de crédito olharia para um lado enquanto o código, na
  cara do relatório, dizia outro. **Zero migração neste bloco** — o
  `codigo VarChar(8)` já existia, obrigatório, desde o M02. Mesmo padrão do
  `conferirCodigoNaturezaDespesa`.
- **A chave do `ORIGEM_RECEITA` é `${categoria}${dígito}`, não o dígito solto.** O
  2º dígito "1" é IMPOSTOS numa receita corrente e OPERAÇÕES DE CRÉDITO numa de
  capital. Um `Record<dígito, Origem>` diria que a 2.1 é imposto — e o guard da
  TR 4.64 engoliria o IPTU.
- **13 chaves, não 26.** As intraorçamentárias (7 e 8) **reusam** o rol de origens da
  1 e da 2: a Portaria 338/2006 as criou como *especificação* da mesma categoria, não
  como categoria nova. Duplicar o rol seria criar duas verdades sobre o mesmo dígito,
  e o dia em que só uma fosse corrigida a intra classificaria diferente da
  orçamentária.
- **O tipo 4 quita dívida ativa, e não só o 3.** O rol oficial chama o 4 de "multas e
  juros de mora **da dívida ativa**", e o saldo da dívida ativa (M10) soma a
  `INSCRICAO` **e a `ATUALIZACAO`** — que é exatamente a correção/juros lançada sobre
  o crédito. Um guard que só aceitasse o tipo 3 tornaria **impossível** registrar o
  recebimento da parte de juros: o dinheiro entraria no razão, o movimento não
  existiria, e a amarração razão×movimentos acusaria para sempre. O
  `TIPOS_QUE_QUITAM_DIVIDA_ATIVA` é exaustivo — um tipo novo não compila até alguém
  decidir.

## Arquivos deste módulo

- `prisma/schema/m04-receita.prisma` — enum `TipoLancamentoReceita`, models
  `ReceitaArrecadada` e `TipoLancamentoReceitaSagres` (de-para).
- `prisma/sql/uq_estorno_receita_unico.sql` — índice único parcial (uma anulação
  por receita). Aplicado pós-migrate; o `global-setup` dos testes aplica toda a
  pasta `prisma/sql/` automaticamente.
- `modules/m04-receita/dominio.ts` — Zod + roteiro contábil + `comporArrecadacao`
  (**sem I/O**). Reexporta os classificadores.
- `modules/m04-receita/natureza.ts` — **os classificadores da natureza da receita**
  (**sem I/O**): `parsearNaturezaReceita`, `origemDaNatureza` (2º dígito),
  `tipoDaNatureza` (8º), `ehIntraorcamentaria`, e os Records `ORIGEM_RECEITA`,
  `TIPO_RECEITA`, `TIPOS_QUE_QUITAM_DIVIDA_ATIVA`.
- `modules/m04-receita/m04-natureza.test.ts` — 9 testes PUROS (sem banco).
- `modules/m04-receita/ports.ts` — `ReceitaRepositoryPort`,
  `ReceitaClassificacaoPort`, `M04Deps`. Sem Prisma.
- `modules/m04-receita/servico.ts` — `registrarArrecadacao`, `anularArrecadacao`.
- `modules/m04-receita/adapter-prisma.ts` — única camada com Prisma.
- `modules/m04-receita/m04.test.ts` — 17 testes no banco de TESTE.

## Pendências conhecidas

- **`TipoLancamentoReceitaSagres.codigoSagres`: PENDÊNCIA DE DADO.** A estrutura
  do de-para está fechada (mesmo padrão de `TipoReceitaSagres` no M02); faltam os
  literais da tabela `ReceitaOrcamentaria` do SAGRES. Preencher **não** exige
  migração — é o ponto do desacoplamento.
- **`RETIFICACAO` existe no enum mas não tem caso de uso.** Só `ARRECADACAO` e
  `ANULACAO` estão implementadas. **E os classificadores de natureza NÃO a curam** —
  ela foi listada como um dos quatro "guards degradados de raiz comum", e não é: os
  outros três eram lacunas de CLASSIFICAÇÃO (faltava origem/tipo, e agora existem);
  a `RETIFICACAO` é uma lacuna de SEMÂNTICA do próprio valor do enum — a linha
  carrega o **delta** ou o **valor novo**? Os dois somam diferente, e nenhum dígito
  do código de natureza responde isso. O `SINAL_RECEITA_REALIZADA` mantém `null`
  para ela, e quem soma **para e cobra a definição** (fail-closed). Definir a
  semântica é decisão de negócio, não de classificação — **nada foi inventado aqui**.
- **A natureza de tipo 0 (`NAO_VALORIZAVEL_AGREGADORA`) ainda pode ser arrecadada.**
  O rol diz "não valorizável" — arrecadar numa conta agregadora é erro. O guard é
  derivável (`tipoDaNatureza(codigo) !== "NAO_VALORIZAVEL_AGREGADORA"` na
  `registrarArrecadacao`), mas ele só faz sentido depois que o **seed de naturezas
  oficiais do ente** entrar: hoje as fixtures usam códigos agregadores (`21110000`)
  porque não há rol oficial carregado, e apertar agora seria apertar contra o
  fixture, não contra o dado. Aperto declarado, com o furo nomeado.
- **A obrigatoriedade do código nas receitas comuns não é uma pendência** — a
  `NaturezaReceita.codigo` é `NOT NULL VarChar(8)` e a FK
  `ReceitaArrecadada.naturezaReceitaId` é obrigatória. **Toda** receita já tem código
  de 8 dígitos; o parser é fail-closed contra a FORMA, não contra a ausência.
- **O roteiro contábil vem do chamador**, não de uma tabela. A Matriz de Eventos
  (5.91) é quem deve passar a fornecê-lo.

## Fora de escopo aqui

- **Saldo de dotação / empenho / liquidação / pagamento** → M05 (despesa).
- **Receita extraorçamentária** → tesouraria.
- **Dívida ativa** → módulo próprio.
- **Integração tributária real** (a arrecadação chegando de sistema externo) →
  módulo de integração; aqui a arrecadação é registrada pela borda.
- **Matriz de eventos contábeis** — este módulo traz UM roteiro, não a matriz.
