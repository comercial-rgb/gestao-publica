import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { anexo3 } from "./rreo-anexo3.js";
import { type Bimestre } from "./rreo-anexo1.js";
import { anoCivil, janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * RREO — ANEXO 13: PARCERIAS PÚBLICO-PRIVADAS (PPP). Lei 11.079/2004 art. 28 · MDF 15ª ed.
 *
 * ═══ ESQUELETO HONESTO ═══
 * O Anexo 13 tem um layout extenso (ativos, passivos, garantias, fluxo plurianual). Este bloco
 * entrega o que se pode DECLARAR sem inventar: os contratos de PPP registrados e o TETO do art. 28
 * — a soma das contraprestações anuais não pode exceder 5% da RCL. Sem contrato, o demonstrativo é
 * um estado vazio nomeado (Campina Grande não tem PPP ativa). O layout completo da Tabela 13 é
 * PENDÊNCIA DE DADO — entra quando houver contrato real para modelá-lo contra.
 *
 * ═══ AS PÁGINAS CONVERSAM ═══
 * A RCL vem do MESMO motor do Anexo 3 (`anexo3(...).rcl`) — o teto de 5% e o demonstrativo de RCL
 * leem o mesmo número. Uma segunda apuração de RCL aqui divergiria no primeiro corte furado.
 *
 * Leitura pura, composta. Zero escrita.
 */

const LIMITE_PPP = toMoney("5.00"); // 5% da RCL (Lei 11.079 art. 28)

export interface LinhaContratoPPP {
  readonly id: string;
  readonly numero: string;
  readonly objeto: string;
  readonly parceiroPrivado: string;
  readonly vigencia: string; // "2024–2039"
  readonly valorGlobal: string;
  readonly contraprestacaoAnual: string;
}

export interface Anexo13 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly contratos: readonly LinhaContratoPPP[];
  /** Σ das contraprestações anuais dos contratos vigentes no exercício. */
  readonly totalContraprestacoes: string;
  /** A RCL (Anexo 3, mesmo motor) — a base do teto. */
  readonly rcl: string;
  /** % = Σ contraprestações / RCL × 100. */
  readonly percentualDaRcl: string;
  readonly limitePercentual: string; // "5.00"
  readonly dentroDoLimite: boolean;
  readonly notas: readonly string[];
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

function percent(x: Money, a: Money): string {
  if (a.equals(0)) return "0.00";
  return toMoney(x.dividedBy(a).times(100)).toFixed(2);
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function anexo13(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo13> {
  const notas: string[] = [
    "Layout completo da Tabela 13 (ativos, passivos, garantias e fluxo plurianual) é pendência de " +
      "dado — este demonstrativo declara os contratos registrados e o teto do art. 28 (5% da RCL).",
  ];

  // contratos vigentes em ALGUM momento do exercício (vigência cruza o ano).
  const { inicio: inicioAno, fim: fimAno } = janelaCivilDoAno(p.exercicio);
  const registros = await leitor.contratoPPP.findMany({
    where: { vigenciaInicio: { lte: fimAno }, vigenciaFim: { gte: inicioAno } },
    orderBy: { numero: "asc" },
    select: {
      id: true, numero: true, objeto: true, parceiroPrivado: true,
      vigenciaInicio: true, vigenciaFim: true, valorGlobal: true, contraprestacaoAnual: true,
    },
  });

  const contratos: LinhaContratoPPP[] = registros.map((c) => ({
    id: c.id,
    numero: c.numero,
    objeto: c.objeto,
    parceiroPrivado: c.parceiroPrivado,
    vigencia: `${anoCivil(c.vigenciaInicio)}–${anoCivil(c.vigenciaFim)}`,
    valorGlobal: toMoney(c.valorGlobal.toFixed(2)).toFixed(2),
    contraprestacaoAnual: toMoney(c.contraprestacaoAnual.toFixed(2)).toFixed(2),
  }));

  const totalContraprestacoes = contratos.reduce((s, c) => soma(s, toMoney(c.contraprestacaoAnual)), zero());

  // RCL do MESMO motor do Anexo 3 (as páginas conversam).
  const rcl = toMoney((await anexo3(leitor, { exercicio: p.exercicio, bimestre: p.bimestre })).rcl.total12m);
  const percentualDaRcl = percent(totalContraprestacoes, rcl);

  if (contratos.length === 0) {
    notas.push("Não há contrato de PPP registrado — o ente não possui parceria público-privada ativa.");
  }

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    contratos,
    totalContraprestacoes: totalContraprestacoes.toFixed(2),
    rcl: rcl.toFixed(2),
    percentualDaRcl,
    limitePercentual: LIMITE_PPP.toFixed(2),
    dentroDoLimite: toMoney(percentualDaRcl).lessThanOrEqualTo(LIMITE_PPP),
    notas,
  };
}
