import { toMoney, type Money } from "../../packages/contracts/index.js";
// ⚠️ A ÚNICA ARESTA DO M01 PARA OUTRO MÓDULO, e ela é para um arquivo AVULSO que não importa
// nada além de `packages/contracts` — logo não há ciclo. O cabeçalho dele explica por que a
// alternativa (uma segunda cópia da regra, aqui) era pior.
import { parcelasDaGuia } from "../m04-receita/parcelas-por-fonte.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
  CONTA_DDR_DISPONIVEL,
  CONTA_DDR_UTILIZADA,
} from "./roteiros.js";

/** O client OU uma transação dele — mesmo alias do M04/M05. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * O SALDO DA DDR POR FONTE — o insumo do RGF Anexo 5.
 *
 * ═══ A PERGUNTA ═══
 * "Quanto dinheiro daquela fonte ainda está livre?" — que NÃO é a mesma que o controle
 * orçamentário responde ("quanto do crédito sobrou"). As duas divergem o tempo todo: há
 * crédito sem dinheiro (a receita não entrou) e dinheiro sem crédito (arrecadou-se além
 * do previsto). O Anexo 5 publica esta, e é ela que impede empenhar contra caixa que
 * não existe.
 *
 * ═══ ⚠️ A FONTE NÃO ESTÁ NA PERNA — ELA SE DERIVA DO FATO ═══
 * `PartidaContabil` tem `fichaId` (aditivo do M02), mas não `fonteId`; e a arrecadação
 * não tem ficha nenhuma — a receita é do ENTE. Então a fonte de cada perna de controle
 * vem do FATO que gerou o lançamento, pelas relações 1-1 do `LancamentoContabil`:
 *
 *   empenho     → lancamento.empenho.ficha.fonteId
 *   liquidação  → lancamento.liquidacao.empenho.ficha.fonteId
 *   pagamento   → lancamento.pagamento.fonteId      (o pagamento CARREGA a fonte)
 *   arrecadação → lancamento.receita.fonteId
 *
 * Derivar assim custa um join a mais e evita uma coluna nova — que exigiria migração e,
 * pior, uma segunda verdade sobre a fonte de um fato que já a tem.
 *
 * ⚠️ O PAGAMENTO USA A FONTE **DELE**, não a da ficha. São coisas diferentes e podem
 * divergir (o `despesaPorFonte` do M05 registra esse limite): a TR 5.23 amarra
 * `Pagamento.fonteId` à conta bancária, e é de lá que o dinheiro de fato saiu. Para a
 * DDR — que é controle de CAIXA — o que vale é de onde o dinheiro saiu.
 *
 * ═══ ⚠️ O SALDO LIVRE É A PRÓPRIA `disponivel` — NÃO SE SUBTRAI DE NOVO ═══
 * Cada conta é CREDORA e guarda o SUM líquido (crédito − débito) do seu ESTADO:
 *
 *   8.2.1.1.1     C na arrecadação, D no empenho     → o que ainda está LIVRE
 *   8.2.1.1.2.01  C no empenho,     D na liquidação  → comprometido por empenho
 *   8.2.1.1.3.01  C na liquidação,  D no pagamento   → comprometido por liquidação
 *   8.2.1.1.4.01  C no pagamento                     → utilizado (saiu)
 *
 * O empenho JÁ DEBITA a `8.2.1.1.1` — então `disponivel` já vem líquido do que foi
 * comprometido. Uma fórmula `disponivel − comprometida − utilizada` subtrairia o mesmo
 * dinheiro DUAS vezes e reportaria a fonte muito mais pobre do que ela é. Os quatro
 * baldes não se subtraem: eles PARTICIONAM o que entrou.
 *
 * `total` = a soma dos quatro = tudo que a fonte arrecadou, e ele é INVARIANTE ao longo
 * de toda a cadeia (empenhar, liquidar e pagar só movem dinheiro de balde). É por isso
 * que ele serve de prova: se o total mudar num ato que não é arrecadação nem anulação
 * de arrecadação, alguma perna está errada. Ele espelha o saldo da classe 7.
 *
 * ⚠️ Um estorno inverte as pernas e a aritmética o absorve sozinha — não há caso
 * especial de anulação aqui.
 */
export interface SaldoDdr {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  /** ⚠️ O SALDO LIVRE. Já vem líquido do comprometido — ver o cabeçalho. */
  readonly disponivel: Money;
  readonly comprometidaEmpenho: Money;
  readonly comprometidaLiquidacao: Money;
  /** Saiu — o pagamento levou. */
  readonly utilizada: Money;
  /** A soma dos quatro baldes = o que a fonte arrecadou. Invariante fora da receita. */
  readonly total: Money;
}

/** As quatro contas da DDR que este leitor soma. */
const CONTAS_DDR = [
  CONTA_DDR_DISPONIVEL,
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
  CONTA_DDR_UTILIZADA,
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// O PLANO DE CONTAS, LISTADO — a leitura que faltava sobre `ContaPcasp`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UMA CONTA DO PLANO, como a tela precisa lê-la.
 *
 * ⚠️ DOIS "NATUREZAS" QUE NÃO SÃO A MESMA COISA — e este contrato só carrega UMA delas.
 *
 *   1. `naturezaSaldo` (DEVEDORA/CREDORA) — É COLUNA DE `ContaPcasp`. Diz de que lado o saldo
 *      da conta é positivo. É atributo ESTÁTICO do plano: a 2.1.8.8.1.01.00 nasce CREDORA e
 *      morre CREDORA, tenha ela movimento ou não.
 *
 *   2. A "natureza da informação" do MSC (patrimonial / orçamentária / controle) — NÃO É COLUNA
 *      DE `ContaPcasp`. Ela vive em `PartidaContabil.subsistema` (enum `Subsistema`), porque é
 *      atributo do LANÇAMENTO, não da conta. Este leitor NÃO a devolve: inventá-la aqui criaria
 *      uma segunda verdade sobre um dado que o razão já tem, e ela divergiria no primeiro
 *      lançamento que tocasse a conta por um subsistema diferente do esperado.
 *
 * Quem quiser exibi-la ao lado do plano tem de DERIVÁ-LA da classe do código (1/2/3/4 =
 * patrimonial, 5/6 = orçamentária, 7/8 = controle) e DIZER que é derivação — é o que a tela faz.
 */
export interface ContaDoPlano {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  /** ⚠️ DEVEDORA/CREDORA — o lado do saldo. NÃO é a natureza da informação do MSC. */
  readonly naturezaSaldo: "DEVEDORA" | "CREDORA";
  readonly nivel: number;
  /** `true` = folha, recebe partida. `false` = sintética, só soma as filhas (guard do M01). */
  readonly analitica: boolean;
  /** F = financeiro, P = permanente (atributo MCASP). Nem toda conta tem. */
  readonly indicadorSuperavit: "F" | "P" | null;
  /** O código do pai (não o id) — é por código que a hierarquia se lê na tela. */
  readonly contaPaiCodigo: string | null;
  /** O PRIMEIRO DÍGITO do código — a CLASSE do PCASP. Derivado, nunca armazenado. */
  readonly classe: string;
}

/**
 * LISTA O PLANO DE CONTAS inteiro, em ordem de CÓDIGO.
 *
 * ⚠️ SEM PAGINAÇÃO E SEM FILTRO POR ORA — o plano é um cadastro pequeno e FECHADO (dezenas de
 * contas na semente, milhares no PCASP completo), e ele se lê inteiro justamente porque a
 * pergunta que a tela responde é "como o plano está organizado", não "onde está a conta X".
 * Filtros por classe/analítica são recorte de APRESENTAÇÃO e ficam na tela — trazê-los para cá
 * exigiria repetir o agrupamento em cada chamador.
 *
 * ⚠️ A ORDEM É `codigo asc` NO BANCO. Ordenar em JS por `localeCompare` daria outra ordem para
 * a mesma lista dependendo do locale do processo — e um plano de contas que muda de ordem entre
 * dois servidores não é um plano de contas.
 *
 * ⚠️ ZERO SALDO AQUI. O saldo de uma conta é do RAZÃO, e o razão tem UM dono (`somasPorConta`,
 * consumido pelo balancete do M12). Somar partida neste leitor seria a segunda verdade que o
 * M12 inteiro existe para não ter. Quem quer plano COM saldo junta as duas leituras por `codigo`.
 */
export async function listarContasPcasp(
  prisma: Tx
): Promise<readonly ContaDoPlano[]> {
  const contas = await prisma.contaPcasp.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      nome: true,
      naturezaSaldo: true,
      nivel: true,
      analitica: true,
      indicadorSuperavit: true,
      // O pai vem pelo CÓDIGO — o id não diz nada a quem lê a tela.
      contaPai: { select: { codigo: true } },
    },
  });

  return contas.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    naturezaSaldo: c.naturezaSaldo,
    nivel: c.nivel,
    analitica: c.analitica,
    indicadorSuperavit: c.indicadorSuperavit,
    contaPaiCodigo: c.contaPai?.codigo ?? null,
    // A classe é o primeiro dígito, e ela é DERIVADA — não há coluna `classe`, e não deve haver:
    // ela é função pura do código, e uma coluna a mais poderia contradizê-lo.
    classe: c.codigo.slice(0, 1),
  }));
}

export async function saldoDdrPorFonte(
  prisma: Tx,
  p: { readonly exercicio: number; readonly ate?: Date | undefined }
): Promise<readonly SaldoDdr[]> {
  const partidas = await prisma.partidaContabil.findMany({
    where: {
      subsistema: "CONTROLE",
      conta: { codigo: { in: [...CONTAS_DDR] } },
      ...(p.ate !== undefined
        ? { lancamento: { dataTransacao: { lte: p.ate } } }
        : {}),
    },
    select: {
      tipo: true,
      valor: true,
      conta: { select: { codigo: true } },
      lancamento: {
        select: {
          // As quatro origens possíveis — uma só existe por lançamento.
          empenho: {
            select: { ficha: { select: { exercicio: true, fonteId: true, fonte: { select: { codigo: true } } } } },
          },
          liquidacao: {
            select: {
              empenho: {
                select: { ficha: { select: { exercicio: true, fonteId: true, fonte: { select: { codigo: true } } } } },
              },
            },
          },
          pagamento: {
            select: {
              fonteId: true,
              fonte: { select: { codigo: true } },
              liquidacao: {
                select: { empenho: { select: { ficha: { select: { exercicio: true } } } } },
              },
            },
          },
          receita: {
            // ⚠️ V16/C30 — A GUIA PODE REPARTIR O DEPÓSITO ENTRE FONTES. A perna de DDR é UMA e
            // carrega o total; quem diz quanto foi de cada fonte é a distribuição da guia. Sem
            // isto, a DDR disponível inteira seria carimbada na fonte PADRÃO da guia — e a DDR é
            // o número que impede empenhar contra dinheiro que não existe.
            //
            // ⚠️ E A DISTRIBUIÇÃO VEM EM CONSULTA SEPARADA, não aninhada aqui: este `select` já
            // desce quatro níveis (partida -> lançamento -> pagamento -> liquidação -> empenho ->
            // ficha), e cada relação aninhada multiplica o tipo condicional que o Prisma gera.
            // Medido: com a distribuição aqui dentro, o `tsc` deste projeto estoura 5 GB de heap
            // e não termina. Uma consulta rasa a mais é barata; um typecheck que não roda, não.
            select: {
              id: true,
              exercicio: true,
              numeroReceita: true,
              fonteId: true,
              exercicioFonte: true,
              valor: true,
              fonte: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });

  const acc = new Map<
    string,
    { fonteCodigo: string; por: Map<string, Money> }
  >();

  // ⚠️ AS FONTES DA GUIA PRECISAM DO CÓDIGO, e a parcela só traz o id. Uma consulta, não uma por
  // parcela: o rol de fontes é um cadastro pequeno e fechado.
  const codigoDaFonte = new Map<string, string>(
    (await prisma.fonteRecurso.findMany({ select: { id: true, codigo: true } })).map((f) => [
      f.id,
      f.codigo,
    ])
  );

  // A distribuição das guias que aparecem nestas partidas — consulta RASA, pelo motivo escrito no
  // `select` acima. Guia sem parcela não aparece no mapa, e `parcelasDaGuia` trata isso.
  const idsDasGuias = [
    ...new Set(
      partidas
        .map((linha) => linha.lancamento.receita?.id)
        .filter((id): id is string => id !== undefined)
    ),
  ];
  const parcelasPorGuia = new Map<
    string,
    { fonteId: string; exercicioFonte: number; valor: { toFixed: (c: number) => string } }[]
  >();
  if (idsDasGuias.length > 0) {
    const todas = await prisma.fonteDaArrecadacao.findMany({
      where: { receitaArrecadadaId: { in: idsDasGuias } },
      orderBy: { criadoEm: "asc" },
      select: {
        receitaArrecadadaId: true,
        fonteId: true,
        exercicioFonte: true,
        valor: true,
      },
    });
    for (const d of todas) {
      const lista = parcelasPorGuia.get(d.receitaArrecadadaId) ?? [];
      lista.push({ fonteId: d.fonteId, exercicioFonte: d.exercicioFonte, valor: d.valor });
      parcelasPorGuia.set(d.receitaArrecadadaId, lista);
    }
  }

  for (const linha of partidas) {
    const l = linha.lancamento;

    // ⚠️ A ORDEM IMPORTA: um lançamento tem UMA origem. O pagamento vem antes da
    // liquidação porque ele tem fonte PRÓPRIA (a do banco), e é ela que vale para o
    // caixa — ver o cabeçalho.
    const origem =
      l.pagamento !== null
        ? {
            fonteId: l.pagamento.fonteId,
            fonteCodigo: l.pagamento.fonte.codigo,
            exercicio: l.pagamento.liquidacao.empenho.ficha.exercicio,
          }
        : l.liquidacao !== null
          ? {
              fonteId: l.liquidacao.empenho.ficha.fonteId,
              fonteCodigo: l.liquidacao.empenho.ficha.fonte.codigo,
              exercicio: l.liquidacao.empenho.ficha.exercicio,
            }
          : l.empenho !== null
            ? {
                fonteId: l.empenho.ficha.fonteId,
                fonteCodigo: l.empenho.ficha.fonte.codigo,
                exercicio: l.empenho.ficha.exercicio,
              }
            : l.receita !== null
              ? {
                  fonteId: l.receita.fonteId,
                  fonteCodigo: l.receita.fonte.codigo,
                  exercicio: l.receita.exercicio,
                }
              : null;

    // ⚠️ FAIL-CLOSED: perna de DDR num lançamento sem origem conhecida é um fato que
    // este leitor não sabe atribuir a fonte nenhuma. Somá-la em "outras" esconderia o
    // buraco; ignorá-la faria o total mentir por omissão.
    if (origem === null) {
      throw new Error(
        `PERNA DE DDR SEM ORIGEM: uma partida de controle (${linha.conta.codigo}) ` +
          `nasceu num lançamento que não é empenho, liquidação, pagamento nem ` +
          `arrecadação. A fonte da DDR se deriva do FATO, e este não tem um. Se um ato ` +
          `novo passou a mover a DDR, ensine este leitor a lê-lo.`
      );
    }

    if (origem.exercicio !== p.exercicio) continue;

    const codigo = linha.conta.codigo;
    const valor = toMoney(linha.valor.toFixed(2));

    // ═══ ⚠️ V16/C30 — A PERNA PODE PERTENCER A MAIS DE UMA FONTE ═══
    // A arrecadação é o único ato que traz recurso novo, e a guia pode repartir o depósito entre
    // fontes. A perna de DDR disponível é UMA e carrega o total; a repartição está na guia.
    //
    // ⚠️ E O RATEIO NÃO É PROPORCIONAL — é EXATO. A soma das parcelas É o total da perna, e a
    // conferência abaixo afirma isso em vez de supor: se um roteiro futuro passar a partir a perna
    // de classe 8, esta leitura RECUSA nomeando a guia, em vez de dividir centavos por
    // proporção e publicar um número que ninguém consegue reconciliar.
    const distribuicaoDaGuia =
      l.receita === null ? [] : parcelasPorGuia.get(l.receita.id) ?? [];
    const fatias: readonly { fonteId: string; fonteCodigo: string; valor: Money }[] =
      l.receita !== null && distribuicaoDaGuia.length > 0
        ? (() => {
            const parcelas = parcelasDaGuia({
              ...l.receita,
              distribuicao: distribuicaoDaGuia,
            });
            const soma = parcelas.reduce(
              (t, x) => toMoney(t.plus(x.valor)),
              toMoney("0.00")
            );
            if (!soma.equals(valor)) {
              throw new Error(
                `PERNA DE DDR QUE NÃO CASA COM A DISTRIBUIÇÃO: a guia ` +
                  `${l.receita.numeroReceita} reparte ${soma.toFixed(2)} entre ` +
                  `${parcelas.length} fontes, e esta perna de ${codigo} é de ${valor.toFixed(2)}. ` +
                  `A DDR por fonte só se lê quando as duas coisas são a mesma — se o roteiro passou ` +
                  `a partir a perna de controle, ensine este leitor a lê-la. Nada foi somado.`
              );
            }
            return parcelas.map((x) => ({
              fonteId: x.fonteId,
              fonteCodigo: codigoDaFonte.get(x.fonteId) ?? x.fonteId,
              valor: x.valor,
            }));
          })()
        : [{ fonteId: origem.fonteId, fonteCodigo: origem.fonteCodigo, valor }];

    for (const fatia of fatias) {
      const atual =
        acc.get(fatia.fonteId) ??
        { fonteCodigo: fatia.fonteCodigo, por: new Map<string, Money>() };
      const antes = atual.por.get(codigo) ?? toMoney("0.00");
      // Conta CREDORA: crédito soma, débito subtrai.
      atual.por.set(
        codigo,
        linha.tipo === "CREDITO"
          ? toMoney(antes.plus(fatia.valor))
          : toMoney(antes.minus(fatia.valor))
      );
      acc.set(fatia.fonteId, atual);
    }
  }

  const zero = toMoney("0.00");
  return [...acc.entries()]
    .map(([fonteId, { fonteCodigo, por }]) => {
      const disponivel = por.get(CONTA_DDR_DISPONIVEL) ?? zero;
      const comprometidaEmpenho = por.get(CONTA_DDR_COMPROMETIDA_EMPENHO) ?? zero;
      const comprometidaLiquidacao =
        por.get(CONTA_DDR_COMPROMETIDA_LIQUIDACAO) ?? zero;
      const utilizada = por.get(CONTA_DDR_UTILIZADA) ?? zero;

      return {
        fonteId,
        fonteCodigo,
        disponivel,
        comprometidaEmpenho,
        comprometidaLiquidacao,
        utilizada,
        // SOMA, não subtração — os baldes particionam o que entrou. Ver o cabeçalho.
        total: toMoney(
          disponivel
            .plus(comprometidaEmpenho)
            .plus(comprometidaLiquidacao)
            .plus(utilizada)
        ),
      };
    })
    .sort((a, b) => a.fonteCodigo.localeCompare(b.fonteCodigo));
}
