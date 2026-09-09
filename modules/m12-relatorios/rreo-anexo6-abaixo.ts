import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { dclNoCorte } from "./rgf-anexo2.js";
import { variacaoMonetariaDaDivida } from "../m10-patrimonial/consultas.js";
import { anexo6 } from "./rreo-anexo6.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 6 · RESULTADO PRIMÁRIO E NOMINAL, ABAIXO DA LINHA (LRF, art. 53, III). 7.8-b.
 *
 * ═══ O QUE É "ABAIXO DA LINHA" ═══
 * O acima-da-linha (`rreo-anexo6.ts`) mede o resultado pelo FLUXO: receitas primárias menos despesas
 * primárias, em caixa. O abaixo-da-linha mede o MESMO resultado pelo ESTOQUE: a variação da Dívida
 * Consolidada Líquida (DCL) entre dois cortes. São duas estradas para o mesmo número — e é essa
 * dupla medida que a LRF pede, porque uma serve de prova da outra.
 *
 * ═══ ⚠️ A CONVENÇÃO DE SINAL (registrada — MDF 15ª ed., Siconfi) ═══
 *   RESULTADO NOMINAL = DCL(corte inicial) − DCL(corte final).
 * DCL que CAI no período → resultado POSITIVO → superávit nominal. É a mesma direção do acima-da-
 * linha (XXVII positivo = superávit): reduzir o endividamento líquido é o resultado favorável.
 *   · corte inicial = 31/12 do exercício ANTERIOR (o saldo de abertura).
 *   · corte final   = fim do bimestre de referência (o corte do acima-da-linha).
 *
 * ═══ ⚠️ AJUSTES METODOLÓGICOS — só o que TEM FATO, e com o sinal que o fato dá ═══
 * Nem toda variação da DCL veio de esforço fiscal do período. Os itens que a moveram SEM esforço
 * fiscal entram como ajuste, para o nominal não os contar como resultado. A regra é a de sempre:
 * fato rastreável → linha viva; sem fato → parâmetro nomeado, nunca inventado.
 *   · VARIAÇÃO MONETÁRIA (viva): `ATUALIZACAO_MONETARIA` do M10 aumenta o passivo por correção de
 *     índice, sem gasto. É a ÚNICA variação não-fiscal com fato rastreável E sinal inequívoco no
 *     censo. Somada de volta ao bruto (o passivo subiu sem déficit, então não é déficit).
 *   · Os demais são PARÂMETROS NOMEADOS (zero), porque o fato não existe ou o sinal não é separável:
 *     - ALIENACAO-INVESTIMENTOS: o censo só modela bens operacionais (ver SEM-ALIENACAO-DE-
 *       INVESTIMENTOS no acima-da-linha); alienação de investimento não existe como fato.
 *     - DESINCORPORACAO-PASSIVO: o cancelamento de RP (4.6.4) EXISTE e já move a DCL (reduz o RP
 *       processado → sobe a disponibilidade → cai a DCL). Mas isolar a parcela NÃO-FISCAL dele
 *       exigiria o discriminador "por insuficiência", que é texto livre — o mesmo motivo pelo qual
 *       o RGF Anexo 5 crava `CANCELADOS-POR-INSUFICIENCIA = 0`. Marcá-lo com sinal seria inventar.
 *     - RECONHECIMENTO-DIVIDA-SEM-EXECUCAO: no censo, só a atualização monetária reconhece dívida
 *       sem execução (já viva acima). Não há path genérico de "reconhecer dívida" — parâmetro.
 *
 * ═══ ⚠️ A HARMONIZAÇÃO, E O FURO DO XXV (a identidade da sessão) ═══
 * Acima e abaixo deveriam coincidir. Mas o XXV (juros ativos) é INTERRUPTOR desde a 7.8-a — não há
 * natureza de juros de haveres no censo — então o XXVII (nominal ACIMA) sai `null`, e por espelho o
 * `primárioAbaixo` (= nominal abaixo − juros nominais líquidos) TAMBÉM sai `null`: sem o XXV não se
 * fecha a conta dos juros de nenhum dos lados. Não relaxamos o interruptor (zero afirmaria que não
 * houve juros ativos; o que sabemos é que não temos como saber).
 *
 * O que RESTA concreto é o par cruzado:
 *   · ACIMA  dá o PRIMÁRIO concreto (XXIV) e o nominal null.
 *   · ABAIXO dá o NOMINAL concreto (variação da DCL) e o primário null.
 * Cada lado preenche exatamente o furo do outro. E num cenário SEM juros e SEM ajustes, nominal ≡
 * primário, então `nominalAbaixo == XXIV` — é o que o teste de harmonização prova, na fixture limpa.
 *
 * ⚠️ NA FIXTURE 7.8-a (com juros e RP) os dois caminhos DIVERGEM, e não é defeito: pagar um RP
 * processado é DCL-NEUTRO (o caixa cai junto com o passivo de RP), mas o acima-da-linha o subtrai no
 * XXIV; e a nota¹ (piso da disponibilidade) quebra a álgebra no corte de abertura. A `diferenca`
 * expõe o gap; o MODULO o nomeia. Fechar isso à força seria maquiar um dos lados.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface LinhaAjusteMetodologico {
  readonly chave: string;
  readonly rotulo: string;
  /** Contribuição ao resultado nominal, COM sinal (some ao bruto). */
  readonly valor: Dinheiro;
  /** "vivo" = computado de fato; "parametro" = zero nomeado (sem fato ou sinal não separável). */
  readonly tipo: "vivo" | "parametro";
}

export interface HarmonizacaoAnexo6 {
  /** XXIV — resultado primário ACIMA (concreto). */
  readonly primarioAcima: Dinheiro;
  /** XXVII — resultado nominal ACIMA. `null` enquanto o XXV for interruptor. */
  readonly nominalAcima: string | null;
  /** Resultado nominal ABAIXO (variação da DCL + ajustes) — concreto. */
  readonly nominalAbaixo: Dinheiro;
  /** Resultado primário ABAIXO. `null` — o espelho do furo do XXV. */
  readonly primarioAbaixo: string | null;
  /** nominalAbaixo − primarioAcima. Zero no cenário sem juros e sem ajustes → os dois fecham. */
  readonly diferenca: Dinheiro;
  /** `true` quando `diferenca` é zero: as duas estradas chegaram ao mesmo número. */
  readonly fecha: boolean;
}

export interface Anexo6AbaixoDaLinha {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  /** ISO — o corte de abertura (31/12 do ano anterior). */
  readonly corteInicial: string;
  /** ISO — o corte de referência (fim do bimestre). */
  readonly corteFinal: string;
  readonly dclInicial: Dinheiro;
  readonly dclFinal: Dinheiro;
  /** DCL(inicial) − DCL(final). Positivo = DCL caiu = superávit nominal BRUTO (antes dos ajustes). */
  readonly variacaoDclBruta: Dinheiro;
  readonly ajustes: readonly LinhaAjusteMetodologico[];
  readonly totalAjustes: Dinheiro;
  /** variacaoDclBruta + Σ ajustes — o RESULTADO NOMINAL abaixo da linha. */
  readonly resultadoNominal: Dinheiro;
  /** XXVI — juros passivos (do acima-da-linha). */
  readonly jurosPassivos: Dinheiro;
  /** XXV − XXVI. `null` enquanto o XXV for interruptor. */
  readonly jurosNominais: string | null;
  /** resultadoNominal − jurosNominais. `null` — o espelho do XXVII. */
  readonly resultadoPrimario: string | null;
  readonly harmonizacao: HarmonizacaoAnexo6;
  readonly notas: readonly string[];
}

/** O último instante de 31/12 do exercício anterior. Ver o cabeçalho. */
function corteDeAbertura(exercicio: number): Date {
  // Um milissegundo antes de 01/01 às 00:00 do exercício — o fim de 31/12 do ano anterior.
  return new Date(Date.UTC(exercicio, 0, 1, 0, 0, 0, 0) - 1);
}

export async function anexo6AbaixoDaLinha(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo6AbaixoDaLinha> {
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const inicial = corteDeAbertura(p.exercicio);

  // ⚠️ A DCL inicial mede o exercício ANTERIOR (o Anexo 5 dela é do ano anterior). A final, o atual.
  const [dclIni, dclFim, acima, varMonetaria] = await Promise.all([
    dclNoCorte(leitor, { exercicio: p.exercicio - 1, corte: inicial }),
    dclNoCorte(leitor, { exercicio: p.exercicio, corte: fim }),
    anexo6(leitor, { exercicio: p.exercicio, bimestre: p.bimestre }),
    variacaoMonetariaDaDivida(leitor, { desde: inicial, ate: fim }),
  ]);

  // DCL caiu → positivo → superávit (ver a convenção de sinal no cabeçalho).
  const variacaoBruta = toMoney(dclIni.dcl.minus(dclFim.dcl));

  const ajustes: LinhaAjusteMetodologico[] = [
    {
      chave: "VARIACAO_MONETARIA",
      rotulo: "(+) Variação monetária da dívida (correção de índice, não-fiscal)",
      valor: serializar(varMonetaria),
      tipo: "vivo",
    },
    {
      chave: "ALIENACAO_INVESTIMENTOS",
      rotulo: "Alienação de investimentos (não modelada)",
      valor: serializar(toMoney("0.00")),
      tipo: "parametro",
    },
    {
      chave: "DESINCORPORACAO_PASSIVO",
      rotulo: "Desincorporação de passivos (parcela não-fiscal não separável)",
      valor: serializar(toMoney("0.00")),
      tipo: "parametro",
    },
    {
      chave: "RECONHECIMENTO_DIVIDA_SEM_EXECUCAO",
      rotulo: "Reconhecimento de dívida sem execução (só via variação monetária)",
      valor: serializar(toMoney("0.00")),
      tipo: "parametro",
    },
  ];
  let totalAjustes = toMoney("0.00");
  for (const a of ajustes) totalAjustes = toMoney(totalAjustes.plus(toMoney(a.valor)));

  const resultadoNominal = toMoney(variacaoBruta.plus(totalAjustes));

  // ── OS JUROS E O PRIMÁRIO ABAIXO — o espelho do furo do XXV ──
  const jurosPassivos = toMoney(acima.jurosPassivos);
  // XXV − XXVI: sem o XXV (interruptor), a subtração não existe. Propaga null, como o XXVII.
  const jurosNominais: string | null = acima.jurosAtivos === null ? null : toMoney(acima.jurosAtivos).minus(jurosPassivos).toFixed(2);
  const resultadoPrimario: string | null =
    jurosNominais === null ? null : toMoney(resultadoNominal.minus(toMoney(jurosNominais))).toFixed(2);

  const primarioAcima = toMoney(acima.resultadoPrimario);
  const diferenca = toMoney(resultadoNominal.minus(primarioAcima));

  const harmonizacao: HarmonizacaoAnexo6 = {
    primarioAcima: serializar(primarioAcima),
    nominalAcima: acima.resultadoNominal, // null (XXV interruptor)
    nominalAbaixo: serializar(resultadoNominal),
    primarioAbaixo: resultadoPrimario, // null (XXV interruptor)
    diferenca: serializar(diferenca),
    fecha: diferenca.isZero(),
  };

  const notas: string[] = [
    "SINAL: resultado nominal = DCL(inicial) − DCL(final). DCL que cai = superávit. Corte inicial = " +
      "31/12 do exercício anterior; corte final = fim do bimestre.",
    "JUROS-ATIVOS-XXV: o XXV é interruptor (`null`), então o resultado PRIMÁRIO abaixo e o nominal " +
      "ACIMA (XXVII) saem `null` — sem o XXV não se fecham os juros de nenhum lado. O que resta " +
      "concreto: o primário vem do acima (XXIV), o nominal vem do abaixo (variação da DCL).",
    "AJUSTES-METODOLOGICOS: só a variação monetária é linha viva (fato rastreável, sinal inequívoco). " +
      "Alienação de investimentos, desincorporação de passivo e reconhecimento de dívida são " +
      "parâmetros nomeados — ver o cabeçalho do módulo.",
  ];
  if (!harmonizacao.fecha) {
    notas.push(
      "HARMONIZACAO-NAO-FECHA: os dois caminhos divergem em " + harmonizacao.diferenca + ". No cenário " +
        "sem juros e sem ajustes eles coincidem (nominal abaixo = XXIV); com juros (XXVI ≠ 0), RP pago " +
        "(DCL-neutro, mas subtraído no XXIV) e o piso da nota¹ no corte de abertura, a diferença é " +
        "ESPERADA e nomeada — ver o MODULO. Não se fecha à força."
    );
  }

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    corteInicial: inicial.toISOString(),
    corteFinal: fim.toISOString(),
    dclInicial: serializar(dclIni.dcl),
    dclFinal: serializar(dclFim.dcl),
    variacaoDclBruta: serializar(variacaoBruta),
    ajustes,
    totalAjustes: serializar(totalAjustes),
    resultadoNominal: serializar(resultadoNominal),
    jurosPassivos: serializar(jurosPassivos),
    jurosNominais,
    resultadoPrimario,
    harmonizacao,
    notas,
  };
}
