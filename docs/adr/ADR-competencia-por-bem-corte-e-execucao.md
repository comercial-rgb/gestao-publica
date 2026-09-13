# ADR — A competência por bem elegível: corte temporal, vigência do parâmetro, execução e estorno com impacto verificado

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 4). Complementa
`ADR-parametros-versionados-e-memoria-de-calculo.md`.

## Contexto

A auditoria do snapshot `77cbcc9` apontou (achados A04, A05 e A07):

- `preverCompetencia` somava todos os movimentos da classe, de qualquer data, e
  `parametroVigente` escolhia a maior versão sem receber a competência: março absorvia a
  entrada de abril e a régua de maio;
- a atualização gerava um movimento da classe sem `bemId`, enquanto o valor do bem lia só os
  movimentos amarrados a ele: a depreciação nunca chegava ao bem, e a soma dos bens não
  acompanhava a classe;
- a análise de estorno combinava tipos ("redução posterior depende de aumento anterior") e era
  conservadora sem dizer; a ordem por `criadoEm` não tinha desempate.

## Decisão

1. **Data de negócio × instante de registro.** A base de uma competência são os movimentos
   VIVOS (estornado e estorno não existem) com `dataMovimento` até o CORTE (o último instante
   civil do mês). O instante de registro (`sequencia`, atribuída pelo banco) governa a análise
   de dependências, porque as conferências usaram o que existia quando o fato foi registrado.
2. **Início da atualização de um bem:** a competência da sua primeira entrada viva. Política
   declarada: MÊS DA ENTRADA. Um bem que entra em abril não é elegível em março. Trocar para
   "mês seguinte" é decisão de parâmetro (pendência `INICIO-DA-ATUALIZACAO-NO-MES-SEGUINTE`).
3. **Vigência de negócio do parâmetro:** `VersaoDeParametroDeAtualizacao.vigenteDesde`
   (competência). `parametroVigenteEm(classe, competência)` escolhe, entre as versões cuja
   vigência alcança a competência, a de maior número. Omitida na definição, a vigência é
   derivada (a competência seguinte à última processada, ou "desde o início"). Uma vigência
   que alcance competência já processada é RECUSADA: alteração retroativa é outro fluxo
   (estornar a execução e reprocessar, com a prévia mostrando o impacto).
4. **Os itens são a única origem dos valores.** Um item por bem elegível e, quando a classe
   tem movimentos sem bem, um item do "acervo sem individualização". Os dois conjuntos
   particionam os movimentos da classe: Σ(itens) = classe por construção. O lançamento
   contábil é UM por execução, com a soma dos itens, e os itens o compartilham. Arredondamento:
   cada item a duas casas; o agregado é a soma dos itens. Nada é contabilizado duas vezes.
5. **Identidade de execução** (`ExecucaoDeAtualizacao`): classe, competência, corte, escopo
   (`CLASSE` ou `BEM`), versão do parâmetro, totais, lançamento. Os itens apontam para ela por
   `operacaoId`; a memória de cálculo é por item (com execução e corte). Estornar um item
   desfaz a execução da classe — os itens e o lançamento único, uma vez — e nunca a "virada"
   de todas as classes: cada classe é a sua execução. A tela diz o escopo antes de lançar.
6. **A depreciação histórica da classe inteira (sem bem) não é distribuída por proporção.**
   Fica visível em `conciliacaoDaClasse` como "acumulada sem individualização"; pendência
   `RECONCILIACAO-HISTORICA-DA-DEPRECIACAO-POR-CLASSE`, com fluxo autorizado a definir.
7. **Dependência do estorno é IMPACTO VERIFICADO.** Cada posterior vivo D é refeito sem M:
   (a) um item de competência depende de M se M compunha a base do MESMO alvo e estava dentro
   do corte; (b) uma redução depende de M se, sem M, o valor do bem de D (quando há) ou da
   classe, no registro de D, ficaria abaixo de D; (c) a baixa da acumulada depende de M se a
   acumulada da classe sem M não a cobriria. O que não fica inválido não bloqueia; o posterior
   do mesmo bem que não bloqueia é informação. As reduções passam a cobrar o teto do BEM, e não
   só o da classe (`exigirTetoDeReducao`).

## Consequências

- Os testes de competência anteriores continuam válidos: uma classe só com movimentos sem bem
  gera um item do acervo com os mesmos números.
- A tela de competência mostra item a item (bem, entrada, base, contábil, residual, parcela,
  teto, situação com nota), o escopo, o corte, a versão vigente e a conciliação.
- O parâmetro ganha "vigente desde a competência" no formulário e no histórico.
- Pendências: `INICIO-DA-ATUALIZACAO-NO-MES-SEGUINTE`,
  `RECONCILIACAO-HISTORICA-DA-DEPRECIACAO-POR-CLASSE`, `VIRADA-DE-TODAS-AS-CLASSES` (a tela
  processa uma classe por execução; a seleção de várias classes é um lote de execuções, ainda
  sem tela).

## Provas

`modules/m10-patrimonial/m10-competencia-v4.test.ts` (t1 março/abril/maio; t2 vigência
retroativa recusada e derivada; t3 N=2 bens, um lançamento, Σ itens = classe = razão; t4
baixa, reavaliação, teto do bem e residual; t5 acervo sem individualização e histórico; t6
estorno da execução; t7 escopo de um bem; t8 e t9 impacto verificado e desempate estável),
`m10-competencia.test.ts`, `m10-parametros-versoes.test.ts`, `m10-estorno-dependencias.test.ts`
(t2 revisto), `m10-alienacao.test.ts`, `test/papel-runtime.test.ts`.
