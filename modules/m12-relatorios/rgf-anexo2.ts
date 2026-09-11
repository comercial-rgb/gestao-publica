import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ═══ NENHUMA ARITMÉTICA NOVA: cada total vem do módulo DONO. ═══
import { anexo13 } from "./rreo-anexo13.js";
import { rclAjustadaDoQuadrimestre } from "./rcl-ajustada.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import { restosAPagarPorFonte } from "../m08-restos-a-pagar/consultas.js";
import { passivoAtuarialEm, saldoDaDividaPorTipo } from "../m10-patrimonial/consultas.js";
import type { Quadrimestre } from "./rgf-anexo1.js";
import { janelaCivilDeMeses } from "../../packages/datas/index.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * RGF — ANEXO 2: DÍVIDA CONSOLIDADA LÍQUIDA. LRF art. 55, I, "b".
 *
 * ═══ O QUE ESTE ANEXO DECIDE ═══
 * É ele que diz se o ente cabe no limite de endividamento do Senado (120% da RCL
 * ajustada) e se disparou o alerta do art. 59, §1º, III (108%). Estourar o limite
 * suspende o ente de contratar operação de crédito e de receber transferências
 * voluntárias.
 *
 * ═══ ⚠️ A NOTA ¹ — O SALDO NEGATIVO QUE NÃO É NEGATIVO ═══
 * Literal (Siconfi, versão municípios):
 *
 *   "Se o saldo apurado for negativo, ou seja, se o total da Disponibilidade de Caixa
 *    Bruta for menor que Restos a Pagar Processados, esse saldo negativo não deverá ser
 *    informado nessa linha, mas sim na linha da 'Insuficiência Financeira', no quadro
 *    'Outros Valores não integrantes da Dívida Consolidada'. Assim, quando o cálculo de
 *    Disponibilidade de Caixa for negativo, o valor dessa linha deverá ser (0) zero."
 *
 * NÃO é opção de apresentação: é regra. E ela tem uma razão dura — uma dedução negativa
 * AUMENTARIA a DCL (subtrair um negativo soma), e o ente apareceria mais endividado do
 * que a lei manda medir. A norma manda a dedução ir a zero e o buraco aparecer, **sem
 * sinal**, em linha própria do quadro informativo, onde ele é visível e não se confunde
 * com dívida.
 *
 * ⚠️ `insuficienciaFinanceira` é ABSOLUTO — sem menos. É o que a nota manda, e é por
 * isso que ela existe: o número é uma falta, não um saldo credor.
 *
 * ═══ AS LETRAS SÃO APRESENTAÇÃO; AS CHAVES SÃO O DADO ═══
 * Mesma doutrina do Anexo 5: as edições do MDF renumeram as linhas, a semântica não
 * muda. `LINHAS_ANEXO2` é cadastro; o motor devolve chaves estáveis.
 */

/** O limite do Senado (Res. 40/2001) e o alerta do art. 59, §1º, III. */
const LIMITE_SENADO = toMoney("120");
const LIMITE_ALERTA = toMoney("108");

/** Uma coluna do anexo: o saldo do exercício anterior + os três quadrimestres. */
export type ColunaAnexo2 = "ANTERIOR" | "Q1" | "Q2" | "Q3";

export interface ValoresDaColuna {
  // ── DÍVIDA CONSOLIDADA (I) ──
  readonly dividaMobiliaria: Dinheiro;
  readonly dividaContratual: Dinheiro;
  /** ⚠️ Linha-parâmetro vazia nomeada — não há entidade de precatório. */
  readonly precatoriosPosteriores2000VencidosNaoPagos: Dinheiro;
  /** ⚠️ Vazia: o cadastro só tem MOBILIARIA e CONTRATUAL. */
  readonly demaisDividas: Dinheiro;
  /** (I) */
  readonly dividaConsolidada: Dinheiro;

  // ── DEDUÇÕES (II) ──
  readonly disponibilidadeCaixaBruta: Dinheiro;
  readonly restosAPagarProcessados: Dinheiro;
  /** ⚠️ NOTA ¹: zero quando bruta < RP processados. Nunca negativo. */
  readonly disponibilidadeDeCaixa: Dinheiro;
  /** ⚠️ Linha-parâmetro vazia nomeada — `DEMAIS-HAVERES-FINANCEIROS`. */
  readonly demaisHaveresFinanceiros: Dinheiro;
  /** (II) */
  readonly deducoes: Dinheiro;

  /** (III) = (I) − (II) */
  readonly dividaConsolidadaLiquida: Dinheiro;

  // ── RCL ──
  /** (IV) */
  readonly rcl: Dinheiro;
  /** (V) — emendas individuais (CF art. 166-A, §1º) */
  readonly emendasIndividuais: Dinheiro;
  /** (VI) = (IV) − (V) */
  readonly rclAjustada: Dinheiro;

  /** (I / VI) × 100. `null` quando a RCL ajustada é zero — não se divide por zero. */
  readonly percentDcSobreRcl: string | null;
  /** (III / VI) × 100. `null` quando a RCL ajustada é zero. */
  readonly percentDclSobreRcl: string | null;
  /** `null` quando não há percentual. */
  readonly excedeuLimite: boolean | null;
  /** `null` quando não há percentual. `true` entre 108% e 120%. */
  readonly emAlerta: boolean | null;
}

/** O quadro "Outros Valores não Integrantes da Dívida Consolidada". */
export interface QuadroInformativo {
  /** ⚠️ Linha-parâmetro vazia nomeada. */
  readonly precatoriosAnteriores2000: Dinheiro;
  /** ⚠️ Linha-parâmetro vazia nomeada. */
  readonly precatoriosPosteriores2000NaoIncluidos: Dinheiro;
  /** Σ das provisões matemáticas previdenciárias (M10, TR 5.89). */
  readonly passivoAtuarial: Dinheiro;
  /** ⚠️ A NOTA ¹ em ação: o negativo da disponibilidade, SEM sinal. */
  readonly insuficienciaFinanceira: Dinheiro;
  /** ⚠️ Linha-parâmetro vazia nomeada — `DEPOSITOS-SEM-CORRESPONDENCIA`. */
  readonly depositosSemCorrespondencia: Dinheiro;
  /** RP não processados (M08). */
  readonly rpNaoProcessados: Dinheiro;
  /** ⚠️ Linha-parâmetro vazia nomeada — não há entidade de ARO. */
  readonly aro: Dinheiro;
  /** Σ dos contratos de PPP (M11 / RREO Anexo 13). */
  readonly dividaContratualPpp: Dinheiro;
}

export interface Anexo2Rgf {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
  /** As colunas publicadas: o anterior + os quadrimestres ATÉ o de referência. */
  readonly colunas: readonly { readonly coluna: ColunaAnexo2; readonly rotulo: string; readonly valores: ValoresDaColuna }[];
  /** O informativo é do corte de REFERÊNCIA (a última coluna). */
  readonly quadroInformativo: QuadroInformativo;
  readonly limiteSenado: string;
  readonly limiteAlerta: string;
  readonly notas: readonly string[];
}

/**
 * O CADASTRO DE LINHAS — chaves estáveis, rótulo e nível de apresentação.
 * ⚠️ É dado: as edições renumeram, a semântica não muda.
 */
export const LINHAS_ANEXO2: readonly {
  readonly chave: keyof ValoresDaColuna;
  readonly rotulo: string;
  readonly nivel: "grupo" | "item" | "subitem" | "total";
}[] = [
  { chave: "dividaConsolidada", rotulo: "DÍVIDA CONSOLIDADA — DC (I)", nivel: "grupo" },
  { chave: "dividaMobiliaria", rotulo: "Dívida Mobiliária", nivel: "item" },
  { chave: "dividaContratual", rotulo: "Dívida Contratual", nivel: "item" },
  { chave: "precatoriosPosteriores2000VencidosNaoPagos", rotulo: "Precatórios Posteriores a 05/05/2000 (inclusive) Vencidos e Não Pagos", nivel: "item" },
  { chave: "demaisDividas", rotulo: "Demais Dívidas", nivel: "item" },
  { chave: "deducoes", rotulo: "DEDUÇÕES (II)", nivel: "grupo" },
  { chave: "disponibilidadeDeCaixa", rotulo: "Disponibilidade de Caixa ¹", nivel: "item" },
  { chave: "disponibilidadeCaixaBruta", rotulo: "Disponibilidade de Caixa Bruta", nivel: "subitem" },
  { chave: "restosAPagarProcessados", rotulo: "(−) Restos a Pagar Processados", nivel: "subitem" },
  { chave: "demaisHaveresFinanceiros", rotulo: "Demais Haveres Financeiros", nivel: "item" },
  { chave: "dividaConsolidadaLiquida", rotulo: "DÍVIDA CONSOLIDADA LÍQUIDA — DCL (III) = (I − II)", nivel: "total" },
  { chave: "rcl", rotulo: "RECEITA CORRENTE LÍQUIDA — RCL (IV)", nivel: "grupo" },
  { chave: "emendasIndividuais", rotulo: "(−) Transferências obrigatórias da União — emendas individuais (art. 166-A, §1º, CF) (V)", nivel: "item" },
  { chave: "rclAjustada", rotulo: "RCL AJUSTADA (VI) = (IV − V)", nivel: "total" },
];

/**
 * ⚠️ AS LINHAS-PARÂMETRO VAZIAS NOMEADAS.
 *
 * O grep do Passo 0 é a prova: `precatorio`, `ARO` e `deposito judicial` só aparecem em
 * COMENTÁRIOS do censo — não há entidade para nenhum. Inventar um número aqui seria
 * publicar dívida que ninguém cadastrou; omitir a linha seria esconder que ela existe no
 * layout. Vão a zero, nomeadas, e a página as mostra como interruptor.
 *
 *   PRECATORIOS-CADASTRO ......... as três linhas de precatório (as duas do informativo
 *                                  e a da DC)
 *   ARO-CADASTRO ................. antecipação de receita orçamentária
 *   DEPOSITOS-SEM-CORRESPONDENCIA  depósitos e consignações sem lastro
 *   DEMAIS-HAVERES-FINANCEIROS ... os haveres que deduzem além do caixa
 *   DIVIDA-INTERNA-EXTERNA ....... o cadastro só tem MOBILIARIA × CONTRATUAL
 */
const ZERO_NOMEADO = toMoney("0.00");

/**
 * A DCL NUM CORTE — o dono ÚNICO da aritmética (I − II), agora extraído para um corte ARBITRÁRIO.
 *
 * ⚠️ POR QUE EXISTE (7.8-b). O RREO Anexo 6 abaixo da linha mede o resultado nominal como a VARIAÇÃO
 * da DCL entre dois cortes — e um deles (31/12 do ano anterior) e o outro (fim do bimestre) NÃO são
 * quadrimestrais. Em vez de duplicar a conta da DCL lá (a segunda verdade que divergiria da daqui no
 * dia em que a nota¹ mudasse), o `medirColuna` e o abaixo-da-linha passam a chamar ESTA função. Ela
 * não conhece quadrimestre nem RCL: recebe um `corte` e devolve a DCL e suas partes.
 *
 * A nota¹ (o piso da disponibilidade) mora AQUI, um lugar só — ver o cabeçalho do arquivo.
 */
export interface DclNoCorte {
  readonly mobiliaria: Money;
  readonly contratual: Money;
  /** (I) dívida consolidada (+ precatórios/demais, vazios). */
  readonly dividaConsolidada: Money;
  readonly disponibilidadeBruta: Money;
  readonly rpProcessados: Money;
  readonly rpNaoProcessados: Money;
  /** ⚠️ Nota¹: zero quando bruta < RP processados. Nunca negativa. */
  readonly disponibilidadeDeCaixa: Money;
  /** ⚠️ Nota¹ do outro lado: o negativo da disponibilidade, ABSOLUTO (sem sinal). */
  readonly insuficienciaFinanceira: Money;
  /** (II) deduções (+ demais haveres, vazio). */
  readonly deducoes: Money;
  /** (III) = (I) − (II). */
  readonly dcl: Money;
}

export async function dclNoCorte(
  prisma: Tx,
  p: { readonly exercicio: number; readonly corte: Date }
): Promise<DclNoCorte> {
  // ── (I) A DÍVIDA CONSOLIDADA — do M10, por tipo. ──
  const divida = await saldoDaDividaPorTipo(prisma, { corte: p.corte });
  const dc = toMoney(divida.total.plus(ZERO_NOMEADO)); // + precatórios (vazio) + demais (vazio)

  // ── (II) AS DEDUÇÕES ──
  // ⚠️ UM DONO: a disponibilidade bruta é a `totalBruta` do Anexo 5. Somá-la de novo aqui seria a
  // segunda aritmética sobre o mesmo caixa.
  const a5 = await rgfAnexo5(prisma, { exercicio: p.exercicio, corte: p.corte });
  const bruta = toMoney(a5.totalBruta);

  const restos = await restosAPagarPorFonte(prisma, { ate: p.corte });
  let rpProcessados = toMoney("0.00");
  let rpNaoProcessados = toMoney("0.00");
  for (const r of restos.values()) {
    rpProcessados = toMoney(rpProcessados.plus(r.processado));
    rpNaoProcessados = toMoney(rpNaoProcessados.plus(r.naoProcessado));
  }

  // ⚠️ A NOTA ¹: negativo vai a ZERO na dedução, e a falta aparece como insuficiência ABSOLUTA.
  const caixaLiquido = toMoney(bruta.minus(rpProcessados));
  const disponibilidadeDeCaixa = caixaLiquido.lessThan(0) ? toMoney("0.00") : caixaLiquido;
  const insuficienciaFinanceira = caixaLiquido.lessThan(0) ? toMoney(caixaLiquido.negated()) : toMoney("0.00");

  const deducoes = toMoney(disponibilidadeDeCaixa.plus(ZERO_NOMEADO)); // + demais haveres (vazio)
  const dcl = toMoney(dc.minus(deducoes));

  return {
    mobiliaria: divida.mobiliaria,
    contratual: divida.contratual,
    dividaConsolidada: dc,
    disponibilidadeBruta: bruta,
    rpProcessados,
    rpNaoProcessados,
    disponibilidadeDeCaixa,
    insuficienciaFinanceira,
    deducoes,
    dcl,
  };
}

export async function rgfAnexo2(
  prisma: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<Anexo2Rgf> {
  const notas: string[] = [
    "PRECATORIOS-CADASTRO: não há entidade de precatório no sistema — as três linhas de " +
      "precatório (a da DC e as duas do quadro informativo) são interruptores vazios nomeados.",
    "ARO-CADASTRO / DEPOSITOS-SEM-CORRESPONDENCIA / DEMAIS-HAVERES-FINANCEIROS: sem entidade " +
      "no cadastro — linhas vazias nomeadas.",
    "PPP-DIVIDA-CRITERIO: o layout pede \"Dívida Contratual de PPP\" sem dizer QUAL medida (valor " +
      "global, saldo devedor ou contraprestações a pagar). Adotado o VALOR GLOBAL do RREO Anexo 13 — " +
      "o mais conservador; se a norma quiser o saldo devedor, o número está para MAIS.",
    "DIVIDA-INTERNA-EXTERNA: o cadastro distingue MOBILIÁRIA × CONTRATUAL (enum TipoDivida) e " +
      "NÃO tem interna × externa. Inferi-la do nome do credor seria adivinhação. 'Demais Dívidas' " +
      "fica zero: toda dívida cadastrada cai num dos dois tipos.",
  ];

  const colunas: { coluna: ColunaAnexo2; rotulo: string; valores: ValoresDaColuna }[] = [];

  // ── A COLUNA DO EXERCÍCIO ANTERIOR: o corte é 31/12 do ano passado. ──
  colunas.push({
    coluna: "ANTERIOR",
    rotulo: `Saldo do Exercício Anterior (${p.exercicio - 1})`,
    valores: await medirColuna(prisma, p.exercicio - 1, 3, notas),
  });

  // ── OS QUADRIMESTRES ATÉ O DE REFERÊNCIA. ──
  // ⚠️ Só até o de referência: publicar o 3º quadrimestre no relatório do 1º mostraria
  // um futuro que ainda não aconteceu.
  const rotulos: Record<number, string> = { 1: "1º Quadrimestre", 2: "2º Quadrimestre", 3: "3º Quadrimestre" };
  for (let q = 1 as Quadrimestre; q <= p.quadrimestre; q = (q + 1) as Quadrimestre) {
    colunas.push({
      coluna: `Q${q}` as ColunaAnexo2,
      rotulo: rotulos[q]!,
      valores: await medirColuna(prisma, p.exercicio, q, notas),
    });
  }

  return {
    exercicio: p.exercicio,
    quadrimestre: p.quadrimestre,
    colunas,
    quadroInformativo: await montarInformativo(prisma, p.exercicio, p.quadrimestre),
    limiteSenado: LIMITE_SENADO.toFixed(2),
    limiteAlerta: LIMITE_ALERTA.toFixed(2),
    notas,
  };
}

/** O último instante do quadrimestre — a mesma conversão do RGF Anexo 1. */
function corteDoQuadrimestre(exercicio: number, quadrimestre: Quadrimestre): Date {
  return janelaCivilDeMeses(exercicio, (quadrimestre - 1) * 4 + 1, 4).fim;
}

async function medirColuna(
  prisma: Tx,
  exercicio: number,
  quadrimestre: Quadrimestre,
  notas: string[]
): Promise<ValoresDaColuna> {
  const corte = corteDoQuadrimestre(exercicio, quadrimestre);

  // ── (I), (II) e (III): a DCL é dona única do `dclNoCorte` — o mesmo que o abaixo-da-linha usa. ──
  const d = await dclNoCorte(prisma, { exercicio, corte });
  const dc = d.dividaConsolidada;
  const bruta = d.disponibilidadeBruta;
  const rpProcessados = d.rpProcessados;
  const disponibilidadeDeCaixa = d.disponibilidadeDeCaixa;
  const deducoes = d.deducoes;
  const dcl = d.dcl;

  // ── A RCL AJUSTADA — motor único da família da dívida (regra Siconfi). Ver `rcl-ajustada.ts`. ──
  const { rcl, emendasIndividuais: emendas, rclAjustada } = await rclAjustadaDoQuadrimestre(prisma, {
    exercicio,
    quadrimestre,
  });

  // ⚠️ RCL ZERO NÃO É 0%: sem RCL não há limite a medir, e dividir por zero é o bug que
  // produziria um "0,00%" que o leitor tomaria por folga.
  const temRcl = rclAjustada.greaterThan(0);
  if (!temRcl && !notas.some((n) => n.startsWith("SEM-RCL"))) {
    notas.push(
      "SEM-RCL-NO-CORTE: a RCL ajustada é zero em ao menos uma coluna — os percentuais e os " +
        "limites não se aplicam ali. A linha mostra os valores, não um percentual."
    );
  }
  const percentDc = temRcl ? toMoney(dc.times(100).div(rclAjustada)) : null;
  const percentDcl = temRcl ? toMoney(dcl.times(100).div(rclAjustada)) : null;

  return {
    dividaMobiliaria: serializar(d.mobiliaria),
    dividaContratual: serializar(d.contratual),
    precatoriosPosteriores2000VencidosNaoPagos: serializar(ZERO_NOMEADO),
    demaisDividas: serializar(ZERO_NOMEADO),
    dividaConsolidada: serializar(dc),
    disponibilidadeCaixaBruta: serializar(bruta),
    restosAPagarProcessados: serializar(rpProcessados),
    disponibilidadeDeCaixa: serializar(disponibilidadeDeCaixa),
    demaisHaveresFinanceiros: serializar(ZERO_NOMEADO),
    deducoes: serializar(deducoes),
    dividaConsolidadaLiquida: serializar(dcl),
    rcl: serializar(rcl),
    emendasIndividuais: serializar(emendas),
    rclAjustada: serializar(rclAjustada),
    percentDcSobreRcl: percentDcl === null ? null : percentDc!.toFixed(2),
    percentDclSobreRcl: percentDcl === null ? null : percentDcl.toFixed(2),
    excedeuLimite: percentDcl === null ? null : percentDcl.greaterThan(LIMITE_SENADO),
    emAlerta:
      percentDcl === null
        ? null
        : percentDcl.greaterThanOrEqualTo(LIMITE_ALERTA) && percentDcl.lessThanOrEqualTo(LIMITE_SENADO),
  };
}

async function montarInformativo(
  prisma: Tx,
  exercicio: number,
  quadrimestre: Quadrimestre
): Promise<QuadroInformativo> {
  const corte = corteDoQuadrimestre(exercicio, quadrimestre);
  const zero = toMoney("0.00");

  // ⚠️ A INSUFICIÊNCIA e o RPNP saem do MESMO `dclNoCorte` que a coluna: a nota¹ é dona única, e
  // recomputá-la aqui seria a segunda verdade sobre o mesmo caixa.
  const d = await dclNoCorte(prisma, { exercicio, corte });
  const insuficiencia = d.insuficienciaFinanceira;
  const rpNaoProcessados = d.rpNaoProcessados;

  /**
   * A DÍVIDA CONTRATUAL DE PPP — consumida do RREO Anexo 13, o dono do cadastro.
   *
   * ⚠️ PPP-DIVIDA-CRITERIO (pendência): o layout diz "Dívida Contratual de PPP" e não
   * diz QUAL medida — o valor global do contrato, o saldo devedor ou as contraprestações
   * ainda a pagar. Adoto o VALOR GLOBAL (o que o Anexo 13 publica por contrato), que é o
   * mais conservador: nenhuma das outras medidas o excede. Se a norma quiser o saldo
   * devedor, este número está PARA MAIS — e é aqui que se corrige.
   */
  const a13 = await anexo13(prisma, { exercicio, bimestre: (quadrimestre * 2) as 2 | 4 | 6 });
  let ppp = zero;
  for (const c of a13.contratos) ppp = toMoney(ppp.plus(toMoney(c.valorGlobal)));

  return {
    precatoriosAnteriores2000: serializar(ZERO_NOMEADO),
    precatoriosPosteriores2000NaoIncluidos: serializar(ZERO_NOMEADO),
    passivoAtuarial: serializar(await passivoAtuarialEm(prisma, { corte })),
    insuficienciaFinanceira: serializar(insuficiencia),
    depositosSemCorrespondencia: serializar(ZERO_NOMEADO),
    rpNaoProcessados: serializar(rpNaoProcessados),
    aro: serializar(ZERO_NOMEADO),
    dividaContratualPpp: serializar(ppp),
  };
}
