import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A apuração de saldo é do M01 — uma aritmética, muitos recortes. A NATUREZA de
// cada classe vem do `CLASSE_PCASP` (estrutura do MCASP), não de um if solto.
import { saldosPorConta } from "../m01-core-contabil/adapter-prisma.js";
import {
  superavitFinanceiroPorFonte,
  type SuperavitPorFonte,
} from "./superavit-por-fonte.js";

/**
 * BALANÇO PATRIMONIAL — ANEXO 14 (art. 105 da Lei 4.320/64; MCASP Parte V).
 * LEITURA PURA: zero escrita, zero cache, Decimal como string. Regras do M12.
 *
 * ═══ O MAPEAMENTO LINHA → CONTA É TABELA ═══
 * O relatório não sabe (e não deve saber) que "Caixa e Equivalentes" é a 1.1.1.
 * Ele lê `LinhaDemonstrativo` + `PrefixoDaLinha`. Quando o PCASP real do ente
 * chegar, é um INSERT — nenhuma linha de código muda.
 *
 * ═══ O CORTE É A DATA DO FATO (`dataTransacao`), INCLUSIVO ═══
 * A lição do `campoData` do M09: recortar por `criadoEm` (a data da digitação)
 * faria um lançamento de janeiro digitado em março sumir do balanço de janeiro.
 *
 * ═══ AS TRÊS AMARRAÇÕES, AUTO-EXECUTÁVEIS ═══
 * A1. ATIVO == PASSIVO + PATRIMÔNIO LÍQUIDO (a equação fundamental).
 * A2. CONTA ÓRFÃ: nenhuma conta patrimonial com saldo pode ficar fora do quadro.
 *     Um balanço que fecha OMITINDO dinheiro é pior que um que não fecha — ele
 *     parece certo.
 * A3. CONTA EM DUAS LINHAS: o mesmo dinheiro contado duas vezes. O cadastro já
 *     barra a sobreposição de prefixos; isto é defesa em profundidade (um INSERT
 *     direto dribla o serviço).
 *
 * ═══ O QUADRO FINANCEIRO/PERMANENTE (art. 105 da Lei 4.320/64) ═══
 * O MESMO balanço, recortado por OUTRO eixo — ver `montarQuadroFinanceiroPermanente`.
 * F1. AF + AP == ATIVO e PF + PP == PASSIVO (as duas leituras têm de contar o
 *     mesmo dinheiro).
 * F2. CONTA SEM INDICADOR: a irmã da A2 — a órfã do indicador.
 */

export interface LinhaDoBalanco {
  readonly codigoLinha: string;
  readonly rotulo: string;
  readonly valor: Dinheiro;
  /** As contas que compõem a linha — é o que torna o número auditável. */
  readonly contas: readonly { readonly codigo: string; readonly saldo: Dinheiro }[];
}

export type GrupoBalanco =
  | "ATIVO_CIRCULANTE"
  | "ATIVO_NAO_CIRCULANTE"
  | "PASSIVO_CIRCULANTE"
  | "PASSIVO_NAO_CIRCULANTE"
  | "PATRIMONIO_LIQUIDO";

export interface QuadroDoGrupo {
  readonly grupo: GrupoBalanco;
  readonly linhas: readonly LinhaDoBalanco[];
  readonly total: Dinheiro;
}

/**
 * O atributo do PCASP que diz de que LADO da Lei 4.320 a conta está.
 *
 * É PARÂMETRO, nunca derivação do código: o `1.1.3` de um ente pode ser crédito
 * a curto prazo e o de outro pode não ser, e o PCASP oficial da STN já publica
 * este atributo conta a conta. Derivar do código seria inventar o plano.
 */
export type IndicadorSuperavit = "F" | "P";

export const INDICADOR_SUPERAVIT: Record<
  IndicadorSuperavit,
  { readonly nome: string; readonly criterio: string }
> = {
  F: {
    nome: "FINANCEIRO",
    criterio:
      "realizável (ativo) ou exigível (passivo) INDEPENDENTEMENTE de autorização " +
      "orçamentária — art. 105, §§ 1º e 3º",
  },
  P: {
    nome: "PERMANENTE",
    criterio:
      "cuja mobilização (ativo) ou amortização (passivo) DEPENDE de autorização " +
      "legislativa — art. 105, §§ 2º e 4º",
  },
};

export interface ContaDoQuadroFP {
  readonly codigo: string;
  readonly saldo: Dinheiro;
  readonly lado: "ATIVO" | "PASSIVO";
  readonly indicador: IndicadorSuperavit;
}

export interface QuadroFinanceiroPermanente {
  readonly ativoFinanceiro: Dinheiro;
  readonly ativoPermanente: Dinheiro;
  readonly passivoFinanceiro: Dinheiro;
  readonly passivoPermanente: Dinheiro;
  /**
   * AF − PF. NEGATIVO = DÉFICIT financeiro, e ele SAI NEGATIVO.
   *
   * O art. 43, § 2º define superávit financeiro como a "diferença POSITIVA" —
   * mas ali ele está definindo uma FONTE de crédito adicional, não o que o
   * balanço demonstra. Zerar o déficit aqui seria esconder exatamente o número
   * que o gestor precisa ver.
   */
  readonly superavitFinanceiro: Dinheiro;
  /** Conta a conta — é o que torna cada célula auditável. */
  readonly composicao: readonly ContaDoQuadroFP[];
}

export interface BalancoPatrimonial {
  readonly relatorio: "ANEXO 14 — BALANÇO PATRIMONIAL";
  readonly corte: Date;
  readonly grupos: readonly QuadroDoGrupo[];
  readonly totalAtivo: Dinheiro;
  readonly totalPassivo: Dinheiro;
  readonly totalPatrimonioLiquido: Dinheiro;
  /** VPA − VPD. É a linha que faz a equação fundamental fechar (ver abaixo). */
  readonly resultadoDoExercicio: Dinheiro;
  /** O MESMO balanço pelo eixo do art. 105 — um relatório, dois recortes. */
  readonly quadroFinanceiroPermanente: QuadroFinanceiroPermanente;
  /**
   * O superávit financeiro POR FONTE (art. 43, § 1º, III).
   *
   * `null` quando `contasCaixa` não foi informado — ver `OpcoesDoBalanco`.
   */
  readonly superavitPorFonte: SuperavitPorFonte | null;
}

export interface OpcoesDoBalanco {
  /**
   * As contas do PCASP que SÃO caixa. PARÂMETRO: o relatório não adivinha o plano
   * de contas do ente (a mesma regra do mapeamento das linhas).
   *
   * ⚠️ SEM ELAS, O QUADRO POR FONTE NÃO É EMITIDO — e isso é fail-closed, não
   * preguiça. O caixa por fonte é derivado dos FATOS (o razão não tem fonte), e a
   * ÚNICA rede contra um real que entrou sem fato é compará-lo com o caixa do
   * razão. Emitir o quadro sem essa comparação seria publicar um superávit que
   * ninguém conferiu — e é com ele que se abre crédito adicional. Sem o
   * parâmetro, o campo vem `null`, e quem chamou sabe por quê.
   */
  readonly contasCaixa?: readonly string[] | undefined;
}

/**
 * De que LADO do balanço a linha está. O PL é um lado À PARTE, e é isso que o
 * quadro do art. 105 precisa saber (ver `montarQuadroFinanceiroPermanente`).
 */
type LadoDoBalanco = "ATIVO" | "PASSIVO" | "PATRIMONIO_LIQUIDO";

/** Uma conta com saldo, já sabendo de que lado do balanço ela caiu. */
interface ContaClassificada {
  readonly codigo: string;
  readonly saldo: Money;
  readonly lado: LadoDoBalanco;
}

/**
 * FAIL-CLOSED: o `grupo` no banco é o enum LARGO (o mesmo que a DVP usa, com VPA
 * e VPD). Uma linha de DVP cadastrada por engano no Anexo 14 não pode ser
 * ignorada em silêncio — ela levaria o saldo da conta para lugar nenhum.
 */
function ladoDoGrupo(grupo: string, codigoLinha: string): LadoDoBalanco {
  if (GRUPOS_DO_ATIVO.includes(grupo as GrupoBalanco)) return "ATIVO";
  if (GRUPOS_DO_PASSIVO.includes(grupo as GrupoBalanco)) return "PASSIVO";
  if (grupo === "PATRIMONIO_LIQUIDO") return "PATRIMONIO_LIQUIDO";
  throw new Error(
    `LINHA COM GRUPO ESTRANHO AO BALANÇO: a linha ${codigoLinha} do Anexo 14 está ` +
      `no grupo ${grupo}, que não é ativo, passivo nem patrimônio líquido (os ` +
      `grupos VPA/VPD são da DVP). O saldo das contas dela não iria para lugar ` +
      `nenhum no balanço.`
  );
}

/** O código da linha SINTÉTICA do resultado — ver a nota em `balancoPatrimonial`. */
export const LINHA_RESULTADO = "PL.RESULTADO";

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

const GRUPOS_DO_ATIVO: readonly GrupoBalanco[] = [
  "ATIVO_CIRCULANTE",
  "ATIVO_NAO_CIRCULANTE",
];
const GRUPOS_DO_PASSIVO: readonly GrupoBalanco[] = [
  "PASSIVO_CIRCULANTE",
  "PASSIVO_NAO_CIRCULANTE",
];
const ORDEM_DOS_GRUPOS: readonly GrupoBalanco[] = [
  "ATIVO_CIRCULANTE",
  "ATIVO_NAO_CIRCULANTE",
  "PASSIVO_CIRCULANTE",
  "PASSIVO_NAO_CIRCULANTE",
  "PATRIMONIO_LIQUIDO",
];

export async function balancoPatrimonial(
  prisma: PrismaClient,
  corte: Date,
  opcoes?: OpcoesDoBalanco
): Promise<BalancoPatrimonial> {
  const linhas = await prisma.linhaDemonstrativo.findMany({
    where: { anexo: "ANEXO_14", ativa: true },
    orderBy: [{ grupo: "asc" }, { ordem: "asc" }],
    select: {
      codigoLinha: true,
      rotulo: true,
      grupo: true,
      prefixos: { select: { prefixoConta: true } },
    },
  });

  // Os saldos das contas PATRIMONIAIS de balanço (classes 1 e 2), COM a natureza
  // da classe (CLASSE_PCASP). Corte pela data do FATO.
  const saldos = await saldosPorConta(prisma, {
    classes: ["1", "2"],
    ate: corte,
    campoData: "dataTransacao",
  });

  const acumulado = new Map<string, { valor: Money; contas: { codigo: string; saldo: Dinheiro }[] }>();
  for (const l of linhas) {
    acumulado.set(l.codigoLinha, { valor: zero(), contas: [] });
  }

  // As mesmas contas do quadro principal, guardando o GRUPO em que caíram — é o
  // que o quadro financeiro/permanente usa para saber o lado (e para reconhecer
  // o PL, que não é nem financeiro nem permanente).
  const classificadas: ContaClassificada[] = [];

  for (const conta of saldos) {
    // Conta zerada não é órfã: ela não leva dinheiro nenhum para lugar nenhum.
    if (conta.saldo.isZero()) continue;

    const casadas = linhas.filter((l) =>
      l.prefixos.some((p) => conta.codigo.startsWith(p.prefixoConta))
    );

    // ═══ A2 — CONTA ÓRFÃ ═══
    if (casadas.length === 0) {
      throw new Error(
        `CONTA ÓRFÃ no Balanço Patrimonial: a conta ${conta.codigo} tem saldo ` +
          `${serializar(conta.saldo)} no corte e NÃO casa com nenhuma linha do ` +
          `Anexo 14. Um balanço que fecha OMITINDO dinheiro é pior do que um que ` +
          `não fecha: ele parece certo. Mapeie a conta antes de emitir o anexo.`
      );
    }
    // ═══ A3 — CONTA EM DUAS LINHAS ═══
    if (casadas.length > 1) {
      throw new Error(
        `CONTA EM DUAS LINHAS: a conta ${conta.codigo} casa com ` +
          `${casadas.map((c) => c.codigoLinha).join(", ")}. O mesmo dinheiro ` +
          `entraria duas vezes no balanço. Corrija os prefixos (o cadastro barra ` +
          `sobreposição — esta conta entrou por fora dele).`
      );
    }

    const linha = casadas[0]!;
    const alvo = acumulado.get(linha.codigoLinha)!;
    alvo.valor = soma(alvo.valor, conta.saldo);
    alvo.contas.push({ codigo: conta.codigo, saldo: serializar(conta.saldo) });
    classificadas.push({
      codigo: conta.codigo,
      saldo: conta.saldo,
      lado: ladoDoGrupo(linha.grupo, linha.codigoLinha),
    });
  }

  // ═══ O RESULTADO DO EXERCÍCIO ═══
  // Ele NÃO vem do mapeamento: vem das classes 3 e 4, e é ESTRUTURAL.
  //
  // Das partidas dobradas do patrimonial:  A + VPD = P + VPA
  //                          logo:         A = P + (VPA − VPD)
  //
  // Enquanto o exercício não é encerrado, o superávit/déficit ainda não migrou
  // para uma conta de PL (2.3): ele vive nas VPA/VPD. Sem esta linha, o Ativo
  // NUNCA igualaria Passivo + PL — não por erro, mas porque faltaria justamente o
  // resultado. É a linha que a equação fundamental exige.
  const resultado = await resultadoDoExercicio(prisma, corte);

  const grupos: QuadroDoGrupo[] = [];
  let totalAtivo = zero();
  let totalPassivo = zero();
  let totalPL = zero();

  for (const grupo of ORDEM_DOS_GRUPOS) {
    const daqui = linhas.filter((l) => l.grupo === grupo);
    const linhasDoGrupo: LinhaDoBalanco[] = daqui.map((l) => {
      const acc = acumulado.get(l.codigoLinha)!;
      return {
        codigoLinha: l.codigoLinha,
        rotulo: l.rotulo,
        valor: serializar(acc.valor),
        contas: acc.contas,
      };
    });

    let totalDoGrupo = linhasDoGrupo.reduce(
      (acc, l) => soma(acc, toMoney(l.valor)),
      zero()
    );

    if (grupo === "PATRIMONIO_LIQUIDO") {
      linhasDoGrupo.push({
        codigoLinha: LINHA_RESULTADO,
        rotulo: "Resultado do Exercício (superávit/déficit apurado)",
        valor: serializar(resultado),
        contas: [],
      });
      totalDoGrupo = soma(totalDoGrupo, resultado);
    }

    grupos.push({
      grupo,
      linhas: linhasDoGrupo,
      total: serializar(totalDoGrupo),
    });

    if (GRUPOS_DO_ATIVO.includes(grupo)) {
      totalAtivo = soma(totalAtivo, totalDoGrupo);
    } else if (GRUPOS_DO_PASSIVO.includes(grupo)) {
      totalPassivo = soma(totalPassivo, totalDoGrupo);
    } else {
      totalPL = soma(totalPL, totalDoGrupo);
    }
  }

  // ═══ A1 — A EQUAÇÃO FUNDAMENTAL ═══
  const passivoMaisPL = soma(totalPassivo, totalPL);
  if (!totalAtivo.equals(passivoMaisPL)) {
    throw new Error(
      `BALANÇO PATRIMONIAL NÃO FECHA: ATIVO ${serializar(totalAtivo)} ≠ PASSIVO ` +
        `${serializar(totalPassivo)} + PATRIMÔNIO LÍQUIDO ${serializar(totalPL)} = ` +
        `${serializar(passivoMaisPL)}. Diferença: ` +
        `${serializar(sub(totalAtivo, passivoMaisPL))}. Ou uma conta está na ` +
        `natureza errada, ou o resultado do exercício ` +
        `(${serializar(resultado)}) não fecha com o razão.`
    );
  }

  // O MESMO balanço pelo eixo do art. 105 — mesmo corte, mesmos saldos.
  const quadro = await montarQuadroFinanceiroPermanente(prisma, classificadas, {
    ativo: totalAtivo,
    passivo: totalPassivo,
  });

  // E o mesmo superávit, repartido por fonte — a partir dos FATOS. O quadro acima
  // é a leitura do RAZÃO; esta é a dos FATOS, e a S2 obriga as duas a concordar.
  const porFonte =
    opcoes?.contasCaixa === undefined
      ? null
      : await superavitFinanceiroPorFonte(prisma, {
          corte,
          contasCaixa: opcoes.contasCaixa,
          superavitDoQuadro: toMoney(quadro.superavitFinanceiro),
        });

  return {
    relatorio: "ANEXO 14 — BALANÇO PATRIMONIAL",
    corte,
    grupos,
    totalAtivo: serializar(totalAtivo),
    totalPassivo: serializar(totalPassivo),
    totalPatrimonioLiquido: serializar(totalPL),
    resultadoDoExercicio: serializar(resultado),
    quadroFinanceiroPermanente: quadro,
    superavitPorFonte: porFonte,
  };
}

/**
 * O QUADRO FINANCEIRO/PERMANENTE — art. 105 da Lei 4.320/64 e IPC 04.
 *
 * ═══ POR QUE ELE NÃO É UMA FUNÇÃO SOLTA ═══
 * Ele é o MESMO balanço olhado por outro eixo. Se fosse uma chamada separada,
 * seriam duas leituras do razão que ninguém obriga a concordar — e o dia em que
 * uma recortasse por `criadoEm` e a outra por `dataTransacao`, o quadro do art.
 * 105 mostraria um dinheiro que o balanço não mostra. Ele recebe as contas JÁ
 * classificadas pelo quadro principal: uma leitura, dois recortes.
 *
 * ═══ O INDICADOR É PARÂMETRO — E O QUADRO É FAIL-CLOSED ═══
 * "Financeiro" não é uma propriedade do CÓDIGO da conta: é o atributo que o PCASP
 * oficial publica conta a conta (`ContaPcasp.indicadorSuperavit`). Derivar do
 * código seria o relatório inventando o plano de contas. Conta com saldo e sem
 * indicador NÃO entra como zero: derruba o anexo (F2).
 *
 * ═══ O PATRIMÔNIO LÍQUIDO FICA DE FORA, E ISSO É A LEI ═══
 * O art. 105 reparte o ATIVO e o PASSIVO — o Saldo Patrimonial é um TERCEIRO
 * item (inciso V), não uma espécie de passivo. Uma conta de PL (2.3, Resultados
 * Acumulados, onde a apuração do M08 deposita o resultado) é classe 2, mas não é
 * dívida de ninguém: não se paga com autorização orçamentária nem legislativa,
 * porque não se paga. Por isso ela é PULADA aqui, e por isso NÃO se exige
 * indicador dela.
 */
async function montarQuadroFinanceiroPermanente(
  prisma: PrismaClient,
  contas: readonly ContaClassificada[],
  totais: { readonly ativo: Money; readonly passivo: Money }
): Promise<QuadroFinanceiroPermanente> {
  const cadastro = await prisma.contaPcasp.findMany({
    where: { codigo: { in: contas.map((c) => c.codigo) } },
    select: { codigo: true, indicadorSuperavit: true },
  });
  const indicadorDe = new Map<string, IndicadorSuperavit | null>(
    cadastro.map((c) => [c.codigo, c.indicadorSuperavit])
  );

  let ativoFinanceiro = zero();
  let ativoPermanente = zero();
  let passivoFinanceiro = zero();
  let passivoPermanente = zero();
  const composicao: ContaDoQuadroFP[] = [];

  for (const conta of contas) {
    if (conta.lado === "PATRIMONIO_LIQUIDO") continue; // ver o cabeçalho

    const indicador = indicadorDe.get(conta.codigo) ?? null;

    // ═══ F2 — CONTA SEM INDICADOR (a irmã da A2) ═══
    if (indicador === null) {
      throw new Error(
        `CONTA SEM INDICADOR DE SUPERÁVIT FINANCEIRO: a conta ${conta.codigo} tem ` +
          `saldo ${serializar(conta.saldo)} no corte e não está classificada como ` +
          `${INDICADOR_SUPERAVIT.F.nome} ou ${INDICADOR_SUPERAVIT.P.nome}. Sem isso ` +
          `não há como dizer se o superávit financeiro conta com ela — e um ` +
          `superávit apurado a menos vira crédito adicional aberto a menos, ou a ` +
          `mais. Classifique a conta (art. 105) antes de emitir o anexo.`
      );
    }

    if (conta.lado === "ATIVO") {
      if (indicador === "F") {
        ativoFinanceiro = soma(ativoFinanceiro, conta.saldo);
      } else {
        ativoPermanente = soma(ativoPermanente, conta.saldo);
      }
    } else {
      if (indicador === "F") {
        passivoFinanceiro = soma(passivoFinanceiro, conta.saldo);
      } else {
        passivoPermanente = soma(passivoPermanente, conta.saldo);
      }
    }

    composicao.push({
      codigo: conta.codigo,
      saldo: serializar(conta.saldo),
      lado: conta.lado,
      indicador,
    });
  }

  // ═══ F1 — AS DUAS LEITURAS CONTAM O MESMO DINHEIRO ═══
  // O quadro principal reparte as contas por LINHA; este as reparte por
  // INDICADOR. Os dois recortes têm de somar o mesmo total — senão uma conta
  // caiu de um dos dois lados (e a F2 já provou que nenhuma ficou sem balde).
  const ativoDoQuadro = soma(ativoFinanceiro, ativoPermanente);
  if (!ativoDoQuadro.equals(totais.ativo)) {
    throw new Error(
      `QUADRO FINANCEIRO/PERMANENTE NÃO FECHA COM O ATIVO: financeiro ` +
        `${serializar(ativoFinanceiro)} + permanente ${serializar(ativoPermanente)} = ` +
        `${serializar(ativoDoQuadro)}, mas o ATIVO do balanço é ` +
        `${serializar(totais.ativo)}. Diferença: ` +
        `${serializar(sub(ativoDoQuadro, totais.ativo))}.`
    );
  }

  // ⚠️ O PL NÃO ENTRA nesta conta — `totais.passivo` é o passivo SEM o patrimônio
  // líquido (os grupos do balanço já os separam). Somar o PL aqui faria o
  // "passivo permanente" engolir o superávit acumulado do ente.
  const passivoDoQuadro = soma(passivoFinanceiro, passivoPermanente);
  if (!passivoDoQuadro.equals(totais.passivo)) {
    throw new Error(
      `QUADRO FINANCEIRO/PERMANENTE NÃO FECHA COM O PASSIVO: financeiro ` +
        `${serializar(passivoFinanceiro)} + permanente ` +
        `${serializar(passivoPermanente)} = ${serializar(passivoDoQuadro)}, mas o ` +
        `PASSIVO do balanço (sem o patrimônio líquido) é ` +
        `${serializar(totais.passivo)}. Diferença: ` +
        `${serializar(sub(passivoDoQuadro, totais.passivo))}.`
    );
  }

  return {
    ativoFinanceiro: serializar(ativoFinanceiro),
    ativoPermanente: serializar(ativoPermanente),
    passivoFinanceiro: serializar(passivoFinanceiro),
    passivoPermanente: serializar(passivoPermanente),
    // SEM CLAMP: déficit sai negativo (ver a nota no tipo).
    superavitFinanceiro: serializar(sub(ativoFinanceiro, passivoFinanceiro)),
    composicao,
  };
}

/**
 * O RESULTADO DO EXERCÍCIO = VPA − VPD (classes 4 e 3), até o corte.
 *
 * Os saldos vêm COM a natureza da classe (`CLASSE_PCASP`): a VPA (credora) e a
 * VPD (devedora) saem ambas positivas, e o resultado é a diferença.
 */
async function resultadoDoExercicio(
  prisma: PrismaClient,
  corte: Date
): Promise<Money> {
  const saldos = await saldosPorConta(prisma, {
    classes: ["3", "4"],
    ate: corte,
    campoData: "dataTransacao",
  });

  let vpd = zero();
  let vpa = zero();
  for (const s of saldos) {
    if (s.codigo.startsWith("3")) vpd = soma(vpd, s.saldo);
    else vpa = soma(vpa, s.saldo);
  }
  return sub(vpa, vpd);
}
