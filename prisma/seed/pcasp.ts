import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * SEED DO PLANO DE CONTAS PCASP — MÍNIMO, E COM A PROCEDÊNCIA DE CADA LINHA.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA ═══
 * Até a 7.2, `ContaPcasp` NÃO TINHA ORIGEM DE PRODUÇÃO: nascia em 55 arquivos, todos
 * `*.test.ts`. O banco da aplicação tinha três contas avulsas. Como `resolverContas`
 * é fail-closed, toda escrita da execução morria em "Conta(s) inexistente(s) no plano
 * PCASP" — foi o BLOQUEIO que a 7.1 nomeou e que este seed quita.
 *
 * ═══ ⚠️ A PROCEDÊNCIA MORA AQUI, NÃO NO BANCO ═══
 * `ContaPcasp` não tem coluna `origem`, e schema é intocável nesta sessão. Então a
 * procedência é ESTRUTURAL: duas listas exportadas, com nomes que dizem de onde cada
 * conta veio. Quem quiser auditar lê este arquivo — não um campo que precisaria de
 * migração para existir.
 *
 * `CONTAS_PCASP_STN` ......... extrato oficial STN/MCASP. São verdade.
 * `CONTAS_FIXTURE_A_CONFIRMAR` códigos herdados das FIXTURES. São a melhor
 *                              informação disponível, e podem estar errados.
 *
 * Pendência `PCASP-COMPLETO`: o xlsx PCASP Estendido 2026 da STN confirma ou corrige
 * a segunda lista e faz a primeira crescer.
 *
 * ═══ IDEMPOTENTE ═══
 * `upsert` por código. Rodar duas vezes não duplica nem reescreve o que já está certo
 * — o append-only vale para o NEGÓCIO; o plano de contas é CADASTRO.
 *
 * ⚠️ NÃO RODA EM TESTE. `test/limpar-banco.ts` trunca `ContaPcasp`; as fixtures são
 * donas do banco de teste e semeiam as próprias contas. Este seed é para dev/prod.
 */

export type NaturezaSaldo = "DEVEDORA" | "CREDORA";
export type IndicadorSuperavit = "F" | "P";

export interface ContaSeed {
  readonly codigo: string;
  readonly nome: string;
  readonly naturezaSaldo: NaturezaSaldo;
  readonly nivel: number;
  readonly analitica: boolean;
  readonly indicadorSuperavit?: IndicadorSuperavit;
  /** O código da conta PAI. `undefined` = raiz da árvore semeada. */
  readonly pai?: string;
}

/**
 * ═══ LISTA 1 — EXTRATO OFICIAL STN/MCASP ═══
 *
 * As sintéticas ancestrais entram porque a hierarquia (`contaPaiId`) precisa delas —
 * e porque uma analítica órfã é uma conta que nenhum balancete consegue agregar.
 * Sintética NÃO recebe partida (o adapter recusa, INVARIANTE 5).
 */
export const CONTAS_PCASP_STN: readonly ContaSeed[] = [
  // ── classe 5: controle da APROVAÇÃO do planejamento e orçamento ──
  { codigo: "5.0.0.0.0.00.00", nome: "Controles da Aprovação do Planejamento e Orçamento", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "5.2.0.0.0.00.00", nome: "Orçamento Aprovado", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "5.0.0.0.0.00.00" },
  // V35 — a previsão da receita no razão (5.2.1.1.1 / 6.2.1.1), com as mesmas analíticas do plano do TCE-PB.
  { codigo: "5.2.1.0.0.00.00", nome: "Previsão da Receita", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "5.2.0.0.0.00.00" },
  { codigo: "5.2.1.1.0.00.00", nome: "Previsão Inicial da Receita", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "5.2.1.0.0.00.00" },
  { codigo: "5.2.1.1.1.00.00", nome: "Previsão Inicial da Receita Bruta", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "5.2.1.1.0.00.00" },
  { codigo: "5.2.1.1.2.00.00", nome: "(-) Previsão de Deduções da Receita", naturezaSaldo: "CREDORA", nivel: 5, analitica: false, pai: "5.2.1.1.0.00.00" },
  { codigo: "5.2.1.1.2.01.00", nome: "(-) Deduções por Transferências Constitucionais e Legais", naturezaSaldo: "CREDORA", nivel: 6, analitica: false, pai: "5.2.1.1.2.00.00" },
  { codigo: "5.2.1.1.2.01.01", nome: "(-) FUNDEB", naturezaSaldo: "CREDORA", nivel: 7, analitica: true, pai: "5.2.1.1.2.01.00" },
  { codigo: "5.2.1.1.2.99.00", nome: "(-) Outras Deduções", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "5.2.1.1.2.00.00" },
  { codigo: "5.2.2.0.0.00.00", nome: "Fixação da Despesa", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "5.2.0.0.0.00.00" },
  { codigo: "5.2.2.1.0.00.00", nome: "Dotação Orçamentária", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "5.2.2.0.0.00.00" },
  // ⚠️ REALINHADO AO PLANO OFICIAL (V11 V6.2). `5.2.2.1.1.00.00` é SINTÉTICA no PCASP: ela
  // se desdobra em crédito inicial, antecipação pela LDO e outras. O roteiro aponta para a
  // analítica, e o plano mínimo precisa TÊ-LA — senão `seed:pcasp` instala um plano em que
  // o próprio roteiro orçamentário não grava.
  { codigo: "5.2.2.1.1.00.00", nome: "Dotação Inicial", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false, pai: "5.2.2.1.0.00.00" },
  { codigo: "5.2.2.1.1.01.00", nome: "Crédito Inicial", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, pai: "5.2.2.1.1.00.00" },

  // ── classe 6: controle da EXECUÇÃO do planejamento e orçamento ──
  { codigo: "6.0.0.0.0.00.00", nome: "Controles da Execução do Planejamento e Orçamento", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "6.2.0.0.0.00.00", nome: "Execução do Planejamento e Orçamento", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "6.0.0.0.0.00.00" },

  // receita
  { codigo: "6.2.1.0.0.00.00", nome: "Execução da Receita", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "6.2.0.0.0.00.00" },
  { codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA", nivel: 4, analitica: true, pai: "6.2.1.0.0.00.00" },
  { codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: true, pai: "6.2.1.0.0.00.00" },

  // despesa
  { codigo: "6.2.2.0.0.00.00", nome: "Execução da Despesa", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "6.2.0.0.0.00.00" },
  { codigo: "6.2.2.1.0.00.00", nome: "Disponibilidades por Destinação de Recursos", naturezaSaldo: "CREDORA", nivel: 4, analitica: false, pai: "6.2.2.0.0.00.00" },
  { codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "6.2.2.1.0.00.00" },
  { codigo: "6.2.2.1.3.00.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: false, pai: "6.2.2.1.0.00.00" },
  { codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  // ⚠️ DORMENTE — SEM-ESTAGIO-EM-LIQUIDACAO. Uso facultativo no MCASP; este sistema
  // não a usa. Existe no PLANO (é oficial) e não em roteiro nenhum.
  { codigo: "6.2.2.1.3.02.00", nome: "Crédito Empenhado em Liquidação", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  { codigo: "6.2.2.1.3.03.00", nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  { codigo: "6.2.2.1.3.04.00", nome: "Crédito Empenhado Liquidado Pago", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },

  // ── classe 7: o par DEVEDOR do controle de disponibilidade ──
  // ⚠️ Só a ARRECADAÇÃO a move (D 7.2.1.1.x / C 8.2.1.1.1): é o único ato que traz
  // recurso novo.
  //
  // ⚠️ E FOI AQUI QUE O DEFEITO SE ESCONDEU POR ~25 ARQUIVOS DE TESTE (medido em V11 V9.3).
  // A linha de `7.2.1.1.0.00.00` dizia `analitica: true`, e a nota do extrato admitia o
  // motivo: "detalhamento fino a confirmar no xlsx". No `Pcasp_2025.xlsx` do TCE-PB ela é
  // SINTÉTICA — tem cinco filhas — e o `INVARIANTE 5` do adapter recusa partida em conta
  // sintética. Como toda suíte semeia ESTE plano, `roteiroArrecadacao` passava verde em
  // toda parte e recusava em instalação limpa. Um plano de teste que contradiz o plano
  // oficial não é fixture mínima: é um plano DIFERENTE, e ele aprova o que a produção nega.
  //
  // As cinco filhas entram porque a partição é a do plano oficial, conferida linha a linha
  // contra o arquivo — não é detalhamento inventado aqui.
  { codigo: "7.0.0.0.0.00.00", nome: "Controles Devedores", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "7.2.0.0.0.00.00", nome: "Execução da Programação Financeira", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "7.0.0.0.0.00.00" },
  { codigo: "7.2.1.0.0.00.00", nome: "Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "7.2.0.0.0.00.00" },
  { codigo: "7.2.1.1.0.00.00", nome: "Controle da Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "7.2.1.0.0.00.00" },
  { codigo: "7.2.1.1.1.00.00", nome: "Recursos Ordinários", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "7.2.1.1.0.00.00" },
  { codigo: "7.2.1.1.2.00.00", nome: "Recursos Vinculados", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "7.2.1.1.0.00.00" },
  { codigo: "7.2.1.1.3.00.00", nome: "Recursos Extraorçamentários", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "7.2.1.1.0.00.00" },
  { codigo: "7.2.1.1.4.00.00", nome: "Recursos para Compensação Financeira", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "7.2.1.1.0.00.00" },
  { codigo: "7.2.1.1.9.00.00", nome: "Outros Controles da Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "7.2.1.1.0.00.00" },

  // ── classe 8: controle de DISPONIBILIDADE (DDR) ──
  { codigo: "8.0.0.0.0.00.00", nome: "Controles Credores", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "8.2.0.0.0.00.00", nome: "Execução da Programação Financeira", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "8.0.0.0.0.00.00" },
  { codigo: "8.2.1.0.0.00.00", nome: "Disponibilidade por Destinação de Recursos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "8.2.0.0.0.00.00" },
  { codigo: "8.2.1.1.0.00.00", nome: "DDR — Controle", naturezaSaldo: "CREDORA", nivel: 4, analitica: false, pai: "8.2.1.0.0.00.00" },
  // ⚠️ REALINHADO AO PLANO OFICIAL (V11 V6.2), pelo mesmo motivo: `8.2.1.1.1.00.00` é
  // SINTÉTICA e se desdobra em recursos do exercício, de exercícios anteriores e outros.
  { codigo: "8.2.1.1.1.00.00", nome: "Disponibilidade por Destinação de Recursos", naturezaSaldo: "CREDORA", nivel: 5, analitica: false, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.1.01.00", nome: "Recursos Disponíveis para o Exercício", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.1.00.00" },
  { codigo: "8.2.1.1.2.01.00", nome: "DDR Comprometida por Empenho — a Liquidar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.3.01.00", nome: "DDR Comprometida por Liquidação", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.4.01.00", nome: "DDR Utilizada — Execução Orçamentária", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },

  // ── patrimoniais confirmadas nesta sessão ──
  // PCASP 4.6.4: "compreende a contrapartida da desincorporação de passivos,
  // INCLUSIVE as baixas de passivo decorrentes do cancelamento de restos a pagar".
  { codigo: "4.0.0.0.0.00.00", nome: "Variações Patrimoniais Aumentativas", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "4.6.0.0.0.00.00", nome: "Valorização e Ganhos com Ativos e Desincorporação de Passivos", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "4.0.0.0.0.00.00" },
  { codigo: "4.6.4.0.0.00.00", nome: "Ganhos com Desincorporação de Passivos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "4.6.0.0.0.00.00" },
  { codigo: "4.6.4.1.1.00.00", nome: "Ganhos com Desincorporação de Passivos — Consolidação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "4.6.4.0.0.00.00" },

  { codigo: "1.0.0.0.0.00.00", nome: "Ativo", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "1.1.0.0.0.00.00", nome: "Ativo Circulante", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "1.0.0.0.0.00.00" },
  { codigo: "1.1.2.0.0.00.00", nome: "Créditos a Curto Prazo", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  // ⚠️ REPONTADO NO ENT05 (ITEM 3). Era `1.1.2.2.0.00.00`/`1.1.2.2.1.00.00`, e a nota
  // antiga aqui dizia "ANALÍTICO A CONFIRMAR no xlsx PCASP Estendido". O xlsx chegou no
  // ENT04 e CORRIGIU: `1.1.2.2.x` é **CLIENTES**; crédito tributário é `1.1.2.1.x`.
  { codigo: "1.1.2.1.0.00.00", nome: "Créditos Tributários a Receber", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "1.1.2.0.0.00.00" },
  { codigo: "1.1.2.1.1.99.00", nome: "Outros Créditos Tributários a Receber", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P", pai: "1.1.2.1.0.00.00" },
];

/**
 * ═══ LISTA 2 — HERDADAS DAS FIXTURES ═══
 *
 * ⚠️ ESTES CÓDIGOS NÃO SÃO OFICIAIS. São os que as fixtures usam desde o M04, e
 * viraram o plano de facto do projeto por falta de um plano de verdade. Entram no
 * seed para que a execução RODE, e ficam marcados para que ninguém os confunda com a
 * lista 1. O xlsx confirma ou corrige.
 *
 * ⚠️ DIVERGÊNCIA CONHECIDA — DUAS DISPONIBILIDADES. O M04 arrecada em
 * `1.1.1.1.1.00.00` (Caixa) e o M05 paga por `1.1.1.1.2.00.00` (Bancos). As duas
 * entram, porque as fixtures das duas rodam; mas o ente tem UM caixa e UM banco, e
 * uma das duas provavelmente está no lugar errado. Não dá para decidir sem o plano
 * oficial — e chutar aqui faria o Balanço Financeiro somar dois saldos que são o
 * mesmo dinheiro.
 */
export const CONTAS_FIXTURE_A_CONFIRMAR: readonly ContaSeed[] = [
  { codigo: "1.1.1.0.0.00.00", nome: "Caixa e Equivalentes de Caixa", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  { codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F", pai: "1.1.1.0.0.00.00" },
  // ⚠️ REPONTADA NO ENT05 (ITEM 3): `1.1.1.1.2.00.00` é a variante INTRA OFSS (transação
  // entre órgãos do MESMO ente), não a conta bancária comum.
  { codigo: "1.1.1.1.1.19.00", nome: "Bancos Conta Movimento — Demais Contas", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "F", pai: "1.1.1.0.0.00.00" },
  /**
   * ═══ V13 rodada 4 — A CADEIA DO ADIANTAMENTO A PESSOAL, TRANSCRITA DA FONTE OFICIAL ═══
   *
   * ⚠️ NENHUM DESTES CINCO REGISTROS FOI DIGITADO DE MEMÓRIA NEM ADAPTADO. Todos saíram de
   * `docs/oficial/tce-pb/Pcasp_2025.xlsx` (7.864 contas, `sha256`
   * `52ae7c7336b27a5c…` conferido no `MANIFEST.json`), lido por `carregarPlanoOficial()` — o
   * mesmo carregador que `seed:pcasp-oficial` usa. O código, o TÍTULO (em maiúsculas, como a
   * fonte o escreve, com o acento que ela traz), a natureza de saldo, o nível e a
   * analiticidade são os do arquivo, campo por campo:
   *
   *   1.1.3.0.0.00.00  113000000  n3  sintética  DEVEDORA  DEMAIS CRÉDITOS E VALORES A CURTO PRAZO
   *   1.1.3.1.0.00.00  113100000  n4  sintética  DEVEDORA  ADIANTAMENTOS CONCEDIDOS
   *   1.1.3.1.1.00.00  113110000  n5  sintética  DEVEDORA  ADIANTAMENTOS CONCEDIDOS - CONSOLIDAÇÃO
   *   1.1.3.1.1.01.00  113110100  n6  sintética  DEVEDORA  ADIANTAMENTOS CONCEDIDOS A PESSOAL
   *   1.1.3.1.1.01.01  113110101  n7  ANALÍTICA  DEVEDORA  SALÁRIOS E ORDENADOS - ADIANTAMENTOS
   *
   * ⚠️ AS QUATRO SINTÉTICAS ENTRAM PORQUE A HIERARQUIA PRECISA DELAS — e a hierarquia da
   * fonte é esta, sem atalho: o `codigoPai` de cada uma é a anterior, e o da primeira é
   * `1.1.0.0.0.00.00`, que este seed já tem. Sintética não recebe partida (INVARIANTE 5 do
   * adapter); quem recebe é só a analítica do fim.
   *
   * ⚠️ E `indicadorSuperavit` FICA AUSENTE NOS CINCO, DE PROPÓSITO — É PENDÊNCIA, NÃO CAMPO
   * ESQUECIDO. A interface `ContaOficial` (`prisma/seed/oficial/pcasp-oficial.ts`) traz
   * `codigo, codigoOficial, nome, naturezaSaldo, nivel, analitica, retificadora, codigoPai`
   * — e NÃO traz o indicador de superávit financeiro/permanente. Preenchê-lo aqui seria
   * classificar, por analogia, um crédito a curto prazo como financeiro ou permanente, e
   * essa classificação entra no cálculo do superávit financeiro do ente. Fica nomeada:
   * `INDICADOR-DE-SUPERAVIT-DO-ADIANTAMENTO-A-PESSOAL-SEM-FONTE` no MODULO do M33. O campo
   * é opcional em `ContaSeed`, então a ausência é representável — e ausente ela é HONESTA,
   * enquanto um "F" ou um "P" escolhido aqui seria norma inventada dentro de um seed.
   *
   * Quem usa a analítica: o pagamento do adiantamento salarial (M33), que é operação
   * PATRIMONIAL e não empenha — o vale é um DIREITO a receber do servidor, e a folha mensal
   * da mesma competência baixa esse direito ao abatê-lo.
   */
  { codigo: "1.1.3.0.0.00.00", nome: "DEMAIS CRÉDITOS E VALORES A CURTO PRAZO", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  { codigo: "1.1.3.1.0.00.00", nome: "ADIANTAMENTOS CONCEDIDOS", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "1.1.3.0.0.00.00" },
  { codigo: "1.1.3.1.1.00.00", nome: "ADIANTAMENTOS CONCEDIDOS - CONSOLIDAÇÃO", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false, pai: "1.1.3.1.0.00.00" },
  { codigo: "1.1.3.1.1.01.00", nome: "ADIANTAMENTOS CONCEDIDOS A PESSOAL", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: false, pai: "1.1.3.1.1.00.00" },
  { codigo: "1.1.3.1.1.01.01", nome: "SALÁRIOS E ORDENADOS - ADIANTAMENTOS", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, pai: "1.1.3.1.1.01.00" },

  { codigo: "1.1.5.0.0.00.00", nome: "Estoques", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  // ⚠️ REPONTADA NO ENT05 (ITEM 3): `1.1.5.1.1.00.00` é MERCADORIAS PARA REVENDA OU
  // DOAÇÃO — estoque para ALIENAR ou DISTRIBUIR, não o almoxarifado de consumo próprio.
  { codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P", pai: "1.1.5.0.0.00.00" },

  { codigo: "2.0.0.0.0.00.00", nome: "Passivo e Patrimônio Líquido", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "2.1.0.0.0.00.00", nome: "Passivo Circulante", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "2.0.0.0.0.00.00" },
  { codigo: "2.1.1.0.0.00.00", nome: "Obrigações Trabalhistas e Previdenciárias a Pagar", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.1.1.0.00.00", nome: "Pessoal a Pagar", naturezaSaldo: "CREDORA", nivel: 4, analitica: true, indicadorSuperavit: "F", pai: "2.1.1.0.0.00.00" },
  { codigo: "2.1.3.0.0.00.00", nome: "Fornecedores e Contas a Pagar", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar — Consolidação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F", pai: "2.1.3.0.0.00.00" },
  { codigo: "2.1.8.0.0.00.00", nome: "Demais Obrigações a Curto Prazo", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.8.8.1.01.00", nome: "Consignações", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "F", pai: "2.1.8.0.0.00.00" },
  { codigo: "2.2.0.0.0.00.00", nome: "Passivo Não Circulante", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "2.0.0.0.0.00.00" },
  { codigo: "2.2.1.0.0.00.00", nome: "Obrigações a Longo Prazo", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.2.0.0.0.00.00" },
  // ⚠️ REPONTADA NO ENT05 (ITEM 3): `2.2.1.1.1.00.00` é PESSOAL A PAGAR — obrigação de
  // folha. Empréstimo interno de longo prazo por contrato é `2.2.2.1.1.02.98`.
  { codigo: "2.2.2.0.0.00.00", nome: "Empréstimos e Financiamentos a Longo Prazo", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.2.0.0.0.00.00" },
  { codigo: "2.2.2.1.1.02.98", nome: "Outros Contratos — Empréstimos Internos", naturezaSaldo: "CREDORA", nivel: 7, analitica: true, indicadorSuperavit: "P", pai: "2.2.2.0.0.00.00" },

  // RÓTULO adotado do oficial (Pcasp_2025.xlsx, cód. 300000000 = "VARIAÇÃO PATRIMONIAL DIMINUTIVA",
  // singular). Decisão do Winner na S-massa — era divergência de rótulo, não estrutural.
  { codigo: "3.0.0.0.0.00.00", nome: "Variação Patrimonial Diminutiva", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "3.3.0.0.0.00.00", nome: "Uso de Bens, Serviços e Consumo de Capital Fixo", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "3.0.0.0.0.00.00" },
  { codigo: "3.3.2.0.0.00.00", nome: "Serviços", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "3.3.0.0.0.00.00" },
  { codigo: "3.3.2.1.1.01.00", nome: "Serviços de Terceiros — Pessoa Jurídica", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, pai: "3.3.2.0.0.00.00" },

  { codigo: "4.1.0.0.0.00.00", nome: "Impostos, Taxas e Contribuições de Melhoria", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "4.0.0.0.0.00.00" },
  { codigo: "4.1.1.0.0.00.00", nome: "Impostos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "4.1.0.0.0.00.00" },
  { codigo: "4.1.1.2.1.01.00", nome: "VPA — Impostos sobre o Patrimônio", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "4.1.1.0.0.00.00" },

  // ⚠️ FORA DO EXTRATO: o extrato cobre crédito disponível e empenhado (.01-.04),
  // e NÃO menciona reservado nem dotação adicional. Os códigos vêm das fixtures.
  { codigo: "5.2.2.1.2.00.00", nome: "Dotação Adicional", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "5.2.2.1.0.00.00" },
  // ⚠️ V11 V7.1 — O DÉBITO DO CRÉDITO ADICIONAL SUPLEMENTAR. Sem esta linha, `seed:pcasp` +
  // `seed:roteiro-orc` passam a recusar o roteiro do suplementar com "a conta não existe": o
  // plano MÍNIMO ficaria sem o caminho que o plano OFICIAL já tem. No oficial ela é
  // `5.2.2.1.2.01.00 CREDITO ADICIONAL - SUPLEMENTAR`, analítica sob a sintética acima.
  { codigo: "5.2.2.1.2.01.00", nome: "Crédito Adicional - Suplementar", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, pai: "5.2.2.1.2.00.00" },
  { codigo: "6.2.2.1.2.00.00", nome: "Crédito Reservado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "6.2.2.1.0.00.00" },
];

/** As duas listas, na ordem em que a hierarquia se resolve (pai antes de filha). */
export const PLANO_MINIMO: readonly ContaSeed[] = [
  ...CONTAS_PCASP_STN,
  ...CONTAS_FIXTURE_A_CONFIRMAR,
];

export interface ResultadoSeedPcasp {
  readonly criadas: number;
  readonly atualizadas: number;
  readonly total: number;
}

/**
 * Semeia o plano mínimo. Idempotente: `upsert` por código, e o `contaPaiId` é
 * resolvido numa 2ª passada — a árvore não depende da ordem do array.
 */
export async function semearPcasp(
  prisma: ReturnType<typeof criarPrismaClient>
): Promise<ResultadoSeedPcasp> {
  const antes = new Set(
    (await prisma.contaPcasp.findMany({ select: { codigo: true } })).map(
      (c) => c.codigo
    )
  );

  // 1ª passada: as contas, sem o pai (a pai pode ainda não existir).
  for (const c of PLANO_MINIMO) {
    const dados = {
      nome: c.nome,
      naturezaSaldo: c.naturezaSaldo,
      nivel: c.nivel,
      analitica: c.analitica,
      ...(c.indicadorSuperavit !== undefined
        ? { indicadorSuperavit: c.indicadorSuperavit }
        : {}),
    };
    await prisma.contaPcasp.upsert({
      where: { codigo: c.codigo },
      update: dados,
      create: { codigo: c.codigo, ...dados },
    });
  }

  // 2ª passada: a hierarquia, agora que todas existem.
  const porCodigo = new Map(
    (await prisma.contaPcasp.findMany({ select: { id: true, codigo: true } })).map(
      (c) => [c.codigo, c.id]
    )
  );
  for (const c of PLANO_MINIMO) {
    if (c.pai === undefined) continue;
    const paiId = porCodigo.get(c.pai);
    if (paiId === undefined) {
      throw new Error(
        `Conta ${c.codigo} declara pai ${c.pai}, que não está no plano mínimo. ` +
          `Uma analítica órfã não agrega em balancete nenhum.`
      );
    }
    await prisma.contaPcasp.update({
      where: { codigo: c.codigo },
      data: { contaPaiId: paiId },
    });
  }

  const criadas = PLANO_MINIMO.filter((c) => !antes.has(c.codigo)).length;
  return {
    criadas,
    atualizadas: PLANO_MINIMO.length - criadas,
    total: PLANO_MINIMO.length,
  };
}

/** Execução direta: `npm run seed:pcasp`. */
if (process.argv[1]?.includes("pcasp")) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o seed não tem banco.");
  }
  const prisma = criarPrismaClient(url);
  const r = await semearPcasp(prisma);
  console.log(
    `[seed:pcasp] ${r.total} contas (${CONTAS_PCASP_STN.length} STN + ` +
      `${CONTAS_FIXTURE_A_CONFIRMAR.length} a confirmar) — ` +
      `${r.criadas} criada(s), ${r.atualizadas} já existia(m).`
  );
  await prisma.$disconnect();
}
