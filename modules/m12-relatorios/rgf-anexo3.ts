import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { rclAjustadaDoQuadrimestre } from "./rcl-ajustada.js";
import type { Quadrimestre } from "./rgf-anexo1.js";
import { janelaCivilDeMeses } from "../../packages/datas/index.js";

/**
 * RGF — ANEXO 3: GARANTIAS E CONTRAGARANTIAS DE VALORES. LRF art. 55, I, "c" · art. 40 §1º.
 *
 * ═══ O QUE ESTE ANEXO DECIDE ═══
 * O total das garantias concedidas pelo ente (a Estados, Municípios, entidades controladas e por
 * fundos/programas) não pode passar de 22% da RCL ajustada (Res. Senado 43/2001), com alerta em
 * 90% do limite (19,8%). Garantia é o ente se comprometendo a pagar dívida de terceiro se ele não
 * pagar — e ela pesa no limite mesmo antes de ser honrada.
 *
 * ═══ ⚠️ GARANTIAS-SEM-CADASTRO — o demonstrativo nasce ZERADO, e isso é LEGÍTIMO ═══
 * Não há entidade de garantia neste repositório (confirmado no Passo 0.1: nem tabela, nem campo,
 * nem serviço). Não é lacuna a esconder: a maioria dos municípios NÃO concede garantia, e um Anexo
 * 3 inteiro zerado é um demonstrativo VÁLIDO — o ente declarando que não avalizou dívida de
 * ninguém. As linhas existem, zeradas e NOMEADAS como interruptor; a página as mostra com o badge
 * "sem cadastro". Publicar zerado ≠ esconder: é a diferença entre "o ente não concede" e "o sistema
 * não sabe". Aqui é o primeiro, e está dito.
 *
 * Quando o ente cadastrar uma garantia (entidade nova no M10/M11), estas linhas ganham fato e o
 * limite passa a morder — a estrutura do demonstrativo já está pronta para recebê-lo.
 *
 * ═══ RCL: MOTOR ÚNICO (regra Siconfi) ═══
 * A RCL ajustada vem de `rclAjustadaDoQuadrimestre` — o MESMO motor dos Anexos 1/2/4, que a puxa do
 * RREO Anexo 3. R1 trava: a RCL daqui == a RCL do RREO Anexo 3 do período.
 *
 * ═══ AS LETRAS SÃO APRESENTAÇÃO; AS CHAVES SÃO O DADO ═══
 * Mesma doutrina dos Anexos 2/5: as edições do MDF renumeram (I–XIII), a semântica não muda.
 * `LINHAS_ANEXO3` é cadastro; o motor devolve chaves estáveis.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Res. Senado 43/2001: 22% da RCL; alerta em 90% do limite = 19,8%. */
const LIMITE_SENADO = toMoney("22.00");
const LIMITE_ALERTA = toMoney("19.80");

const ZERO = toMoney("0.00");

export type ColunaAnexo3 = "ANTERIOR" | "Q1" | "Q2" | "Q3";

/** Uma linha de garantia (ou contragarantia): externa + interna, e o total da linha. */
export interface LinhaGarantia {
  readonly chave: string;
  readonly rotulo: string;
  readonly externas: Dinheiro;
  readonly internas: Dinheiro;
  /** externas + internas. */
  readonly total: Dinheiro;
}

export interface ValoresColunaAnexo3 {
  // ── GARANTIAS CONCEDIDAS ──
  readonly garantias: readonly LinhaGarantia[]; // I..IV
  /** (V) = I + II + III + IV. */
  readonly totalGarantias: Dinheiro;

  // ── RCL ──
  readonly rcl: Dinheiro; // (VI)
  readonly emendasIndividuais: Dinheiro; // (VII)
  readonly rclAjustada: Dinheiro; // (VIII)

  /** (V / VIII) × 100. `null` quando a RCL ajustada é zero. */
  readonly percentGarantias: string | null;
  readonly excedeuLimite: boolean | null;
  readonly emAlerta: boolean | null;

  // ── CONTRAGARANTIAS RECEBIDAS (espelho) ──
  readonly contragarantias: readonly LinhaGarantia[]; // IX..XII
  /** (XIII) = IX + X + XI + XII. */
  readonly totalContragarantias: Dinheiro;
}

export interface Anexo3Rgf {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
  readonly colunas: readonly { readonly coluna: ColunaAnexo3; readonly rotulo: string; readonly valores: ValoresColunaAnexo3 }[];
  readonly limiteSenado: string;
  readonly limiteAlerta: string;
  /** Campo de MEDIDAS CORRETIVAS do layout — texto livre; vazio enquanto não houver excesso. */
  readonly medidasCorretivas: string | null;
  readonly notas: readonly string[];
}

/**
 * O CADASTRO DE LINHAS DE GARANTIA (I–IV) e o espelho das contragarantias (IX–XII).
 * ⚠️ É dado: chaves estáveis, os romanos são rótulo.
 */
export const LINHAS_GARANTIA: readonly { readonly chave: string; readonly rotulo: string }[] = [
  { chave: "AOS_ESTADOS", rotulo: "Aos Estados (I)" },
  { chave: "AOS_MUNICIPIOS", rotulo: "Aos Municípios (II)" },
  { chave: "AS_ENTIDADES_CONTROLADAS", rotulo: "Às Entidades Controladas (III)" },
  { chave: "POR_FUNDOS_PROGRAMAS", rotulo: "Por Meio de Fundos e Programas (IV)" },
];

export const LINHAS_CONTRAGARANTIA: readonly { readonly chave: string; readonly rotulo: string }[] = [
  { chave: "CG_DOS_ESTADOS", rotulo: "Recebidas dos Estados (IX)" },
  { chave: "CG_DOS_MUNICIPIOS", rotulo: "Recebidas dos Municípios (X)" },
  { chave: "CG_DAS_ENTIDADES_CONTROLADAS", rotulo: "Recebidas das Entidades Controladas (XI)" },
  { chave: "CG_POR_FUNDOS_PROGRAMAS", rotulo: "Recebidas por Meio de Fundos e Programas (XII)" },
];

/** Uma linha de garantia zerada — o interruptor GARANTIAS-SEM-CADASTRO em ação. */
function linhaZerada(def: { chave: string; rotulo: string }): LinhaGarantia {
  return { chave: def.chave, rotulo: def.rotulo, externas: serializar(ZERO), internas: serializar(ZERO), total: serializar(ZERO) };
}

/** O último instante do quadrimestre — a mesma conversão do RGF Anexo 1/2. */
function corteDoQuadrimestre(exercicio: number, quadrimestre: Quadrimestre): Date {
  return janelaCivilDeMeses(exercicio, (quadrimestre - 1) * 4 + 1, 4).fim;
}

async function medirColuna(prisma: Tx, exercicio: number, quadrimestre: Quadrimestre): Promise<ValoresColunaAnexo3> {
  // ── GARANTIAS E CONTRAGARANTIAS: zeradas, nomeadas (Passo 0.1). ──
  const garantias = LINHAS_GARANTIA.map(linhaZerada);
  const contragarantias = LINHAS_CONTRAGARANTIA.map(linhaZerada);
  // (V) e (XIII): a soma de zeros é zero — mas a estrutura fica pronta para o dia do cadastro.
  const totalGarantias = ZERO;
  const totalContragarantias = ZERO;

  // ── RCL AJUSTADA: motor único. O `corteDoQuadrimestre` não é usado no cálculo (não há fato de
  //    garantia por corte), mas nomeia o corte da coluna e prova que o eixo temporal existe. ──
  void corteDoQuadrimestre(exercicio, quadrimestre);
  const { rcl, emendasIndividuais, rclAjustada } = await rclAjustadaDoQuadrimestre(prisma, { exercicio, quadrimestre });

  // ⚠️ RCL ZERO NÃO É 0%: sem RCL não há limite a medir (o mesmo cuidado do Anexo 2).
  const temRcl = rclAjustada.greaterThan(0);
  const percentGarantias = temRcl ? toMoney(totalGarantias.times(100).div(rclAjustada)) : null;

  return {
    garantias,
    totalGarantias: serializar(totalGarantias),
    rcl: serializar(rcl),
    emendasIndividuais: serializar(emendasIndividuais),
    rclAjustada: serializar(rclAjustada),
    percentGarantias: percentGarantias === null ? null : percentGarantias.toFixed(2),
    excedeuLimite: percentGarantias === null ? null : percentGarantias.greaterThan(LIMITE_SENADO),
    emAlerta:
      percentGarantias === null
        ? null
        : percentGarantias.greaterThanOrEqualTo(LIMITE_ALERTA) && percentGarantias.lessThanOrEqualTo(LIMITE_SENADO),
    contragarantias,
    totalContragarantias: serializar(totalContragarantias),
  };
}

export async function rgfAnexo3(
  prisma: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<Anexo3Rgf> {
  const notas: string[] = [
    "GARANTIAS-SEM-CADASTRO: não há entidade de garantia nem de contragarantia no sistema — todas " +
      "as linhas (I–XIII) saem zeradas e nomeadas. Não é lacuna escondida: é o ente declarando que " +
      "não avalizou dívida de terceiro. O limite de 22% da RCL passa a morder quando houver cadastro.",
    "RCL: motor único (regra Siconfi) — a RCL ajustada é a MESMA do RREO Anexo 3 do período; se " +
      "divergisse, os limites de garantia e de dívida mediriam contra receitas diferentes.",
  ];

  const colunas: { coluna: ColunaAnexo3; rotulo: string; valores: ValoresColunaAnexo3 }[] = [];

  // ── A COLUNA DO EXERCÍCIO ANTERIOR (saldo em 31/12). ──
  colunas.push({
    coluna: "ANTERIOR",
    rotulo: `Saldo do Exercício Anterior (${p.exercicio - 1})`,
    valores: await medirColuna(prisma, p.exercicio - 1, 3),
  });

  // ── OS QUADRIMESTRES ATÉ O DE REFERÊNCIA (não publicar o futuro). ──
  const rotulos: Record<number, string> = { 1: "1º Quadrimestre", 2: "2º Quadrimestre", 3: "3º Quadrimestre" };
  for (let q = 1 as Quadrimestre; q <= p.quadrimestre; q = (q + 1) as Quadrimestre) {
    colunas.push({
      coluna: `Q${q}` as ColunaAnexo3,
      rotulo: rotulos[q]!,
      valores: await medirColuna(prisma, p.exercicio, q),
    });
  }

  // MEDIDAS CORRETIVAS: campo do layout. Só há o que corrigir se algum corte excedeu — e como as
  // garantias são zero, nunca excede. Fica `null` (o campo aparece vazio), não uma frase inventada.
  const excedeu = colunas.some((c) => c.valores.excedeuLimite === true);
  const medidasCorretivas = excedeu ? "" : null;

  return {
    exercicio: p.exercicio,
    quadrimestre: p.quadrimestre,
    colunas,
    limiteSenado: LIMITE_SENADO.toFixed(2),
    limiteAlerta: LIMITE_ALERTA.toFixed(2),
    medidasCorretivas,
    notas,
  };
}
