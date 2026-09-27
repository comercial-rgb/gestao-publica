# Varredura — a configuração contábil das operações de restos a pagar (M08), antes de construir

> Levantada na ordem de recuperação e continuidade da contabilidade de Esperança/PB,
> em 2026-09-26, item "retomar C38". **Nada implementado.** O item pedia, literalmente,
> "confirmar por que o domínio já existente precisa de nova tabela de roteiro e se pode
> consumir a configuração comum" — e a resposta mudou o tamanho da unidade duas vezes.
>
> Regra do repositório que este documento cumpre: decisão de modelo se levanta ANTES de
> construir. E a regra que ele protege: nenhum código no código — conta do PCASP vem de
> tabela, fail-closed. Nada aqui inventa conta.

## O que a V14 entregou, e onde ela parou

A V14 tornou os restos a pagar alcançáveis pela interface: `lib/portas/restos-a-pagar.ts`
(listagem e detalhe) e `app/(areas)/despesa/restos-a-pagar/`. **Somente leitura.** As cinco
operações de escrita do domínio (`modules/m08-restos-a-pagar/restos.ts`) ficaram inalcançáveis,
e o motivo registrado foi "as cinco precisam de um `RoteiroContabil` do chamador e não existe
tabela de configuração para restos".

Essa frase estava certa na conclusão e errada em dois números.

## Primeira redução: são TRÊS operações que precisam de roteiro, não cinco

| operação | recebe roteiro? | de onde vêm as contas |
|---|---|---|
| `liquidarRestosAPagar` | **sim** | do chamador |
| `pagarRestosAPagar` | **sim** | do chamador |
| `cancelarRestosAPagar` | **sim** | do chamador |
| `anularPagamentoRestosAPagar` | **não** | pernas invertidas do lançamento original, por `gerarEstorno` do M01 |
| `anularCancelamentoRestosAPagar` | **não** | idem |

Os dois estornos não têm parâmetro `roteiro` nas assinaturas (`restos.ts:642` e `restos.ts:855`).
Eles leem o lançamento original e invertem as pernas. É o append-only do repositório operando:
o estorno não escolhe contas, ele desfaz as que foram usadas. **Configurar conta de estorno seria
criar a possibilidade de um estorno que não fecha com o que estornou.**

## Segunda redução: o domínio já tem os construtores, e eles pedem DUAS contas cada

`modules/m08-restos-a-pagar/dominio.ts:267-325` já traz os três construtores, e cada um declara
uma interface pequena e nomeada:

    roteiroLiquidacaoRestos(ContasLiquidacaoRP)   variacaoDiminutiva + restosAPagarProcessados
    roteiroPagamentoRestos(ContasPagamentoRP)     restosAPagarProcessados + disponibilidade
    roteiroCancelamentoRestos(ContasCancelamentoRP)  restosAPagar + variacaoAumentativa

Portanto o que falta **não** é uma tabela de roteiro de pernas arbitrárias. É configuração de
**quatro a cinco contas nomeadas**. A unidade é menor do que "uma tabela de roteiro como as
outras treze".

## Pode consumir a configuração comum? Não existe configuração comum.

`RoteiroContabil` é um **valor** (`readonly PernaRoteiro[]`), declarado de forma estruturalmente
idêntica e independente em M01, M05, M07 e M08. Não é tabela.

As treze tabelas de roteiro do schema seguem um padrão único: **uma por módulo**, com chave no
enum de movimento daquele módulo e duas colunas de conta.

    RoteiroPatrimonial   tipo TipoMovimentoPatrimonial @unique   contaDebito + contaCredito
    RoteiroDivida        tipo TipoMovimentoDivida @unique        contaDebito + contaCredito
    RoteiroConvenio      (tipo, papelDoEnte) @@unique            contaDebito + contaCredito

Não há tabela genérica, e o padrão é deliberado: a chave é um enum do módulo, então o banco
cobra a exaustividade que um `Record` no código não cobraria (o próprio schema explica isso em
`m08-restos-a-pagar.prisma`, na nota do `ContaNaVirada`).

`RoteiroEncerramento`, que mora no arquivo do M08, **não serve**: ele configura a conta de
Resultados Acumulados do PL para a apuração do resultado. Nada a ver com as operações de RP.

**Uma peça, porém, JÁ TEM fonte e não entra em tabela nova:** a `disponibilidade` do pagamento.
Ela é a conta contábil da conta bancária escolhida no ato (`ContaBancaria.contaContabil`) — a
mesma fonte que a V14 usou para o rol de disponibilidades do Balanço Financeiro. Guardá-la na
configuração criaria um campo que o pagamento sobrescreve, isto é, um campo que mente.

## O que NÃO se decide aqui — e por que o documento para neste ponto

### (a) A inscrição no encerramento NÃO gera lançamento contábil

`encerrarExercicioComRestos` (`encerramento.ts:129`) cria as linhas de
`InscricaoRestosAPagar` e **não chama `lancarNoRazao`**. Não há reclassificação do passivo para
contas de "Restos a Pagar".

A consequência é uma pergunta contábil de verdade, não uma escolha de código: no pagamento de um
resto **PROCESSADO** (liquidado no exercício N, não pago), o passivo a debitar é o que a
liquidação do M05 creditou em N — a conta de fornecedores corrente —, e **não** uma conta de RP.
Já no pagamento de um resto que era NÃO PROCESSADO e foi liquidado em N+1, o passivo é o
`restosAPagarProcessados` que `roteiroLiquidacaoRestos` acabou de creditar. **São dois caminhos
com passivos diferentes, e a diferença é do dado, não do parâmetro.**

Três saídas possíveis, e a escolha é do ente com fundamento do TCE-PB, não minha:
1. derivar o débito do pagamento do lançamento que criou o passivo (correto por construção,
   custa uma leitura, e nunca permite configuração que não fecha);
2. configurar o débito e aceitar que uma configuração errada deixa saldo residual eterno numa
   conta e negativo na outra;
3. gerar, na inscrição, o lançamento de reclassificação para contas de RP — que é mudança de
   comportamento do encerramento, e portanto outra unidade.

A opção 1 é a única que não pede norma nova nem permite configuração incoerente. É a recomendação
registrada; não é decisão tomada.

### (b) Quatro contas de DDR estão CRAVADAS no domínio

`dominio.ts` traz `8.2.1.1.2.01.00`, `8.2.1.1.3.01.00` e `8.2.1.1.4.01.00` como literais dentro
de `roteiroLiquidacaoRestos` e `roteiroPagamentoRestos`. Isso é **código no código**, contra a
regra do `CLAUDE.md` ("conta do PCASP vem de tabela, fail-closed"). Está documentado no arquivo
com boa razão contábil (a DDR comprometida atravessa a virada porque o encerramento só varre as
classes 5 e 6), mas a razão justifica a PERNA existir, não o código estar cravado.

Não é defeito desta unidade e não se conserta de passagem: mover as quatro para configuração
muda o contrato dos três construtores e toca testes de M07, M08, M12 e M14 (treze arquivos
de teste usam os construtores; `dominio.ts` os define). **Pendência nomeada**, com o tamanho medido.

## O contrato de dados, se a opção 1 for a escolhida

Chave por evento real, nunca por par (operação × tipo) — `LIQUIDACAO × PROCESSADO` não existe, e
tabela de configuração com linha impossível é armadilha:

    enum EventoDeRestosAPagar {
      LIQUIDACAO_NAO_PROCESSADO
      CANCELAMENTO_PROCESSADO
      CANCELAMENTO_NAO_PROCESSADO
    }

    model RoteiroRestosAPagar {
      evento     EventoDeRestosAPagar
      versao     Int      @default(1)
      fundamento String?  // por que ESTAS contas — do plano do ente / orientação do TCE
      contaDebitoId  / contaCreditoId  -> ContaPcasp
      criadoEm / criadoPor
      @@unique([evento, versao])
    }

Três linhas. O pagamento não tem linha: o débito vem do passivo que o dado aponta e o crédito da
conta bancária do ato. A `versao` segue o `RoteiroOrcamentario` (V8.4) pelo mesmo motivo — o papel
de runtime não tem `UPDATE` nesta família de tabelas, e o razão escriturado ontem foi feito contra
o roteiro de ontem.

Fail-closed em execução: evento sem linha = operação recusada nomeando o evento. Nunca conta padrão.

## Estado

Nada aplicado. Nenhum schema tocado, nenhuma migration escrita, nenhum `prisma generate` rodado —
a máquina estava com o percurso de outra frente, e schema novo com o `npm run deriva` recém-consertado
e ainda não executado merece banco isolado e máquina livre.
