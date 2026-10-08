import { toMoney, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoMes } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { arrecadadoPorNaturezaFonte } from "./consultas.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — A RECEITA ARRECADADA MÊS A MÊS: por natureza e fonte num exercício (TR 5.10.2.59: o demonstrativo mês a mês,
 * listando as fontes e resumindo por fonte) e por fonte em vários exercícios (TR 5.10.2.60: os últimos três anos).
 *
 * ⚠️ A MESMA ARITMÉTICA, OUTRA CHAVE. Cada mês é `arrecadadoPorNaturezaFonte` na janela civil do mês (o sinal da
 * anulação, a guia repartida entre fontes e o corte pela data do fato são de lá); a visão por fonte é a soma da visão
 * por natureza e fonte. Nenhum laço de sinal novo.
 */

export interface ArrecadadoDaFonteNoAno {
  readonly fonteId: string;
  readonly ano: number;
  /** Doze posições, janeiro a dezembro. */
  readonly meses: readonly Money[];
  readonly total: Money;
}

export interface ArrecadadoDaNaturezaEFonteNoAno extends ArrecadadoDaFonteNoAno {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
}

const doze = (): Money[] => Array.from({ length: 12 }, () => toMoney("0.00"));
const somar = (meses: readonly Money[]): Money => meses.reduce((s, m) => toMoney(s.plus(m)), toMoney("0.00"));

/** Natureza x fonte, mês a mês, de um exercício; ordenado por natureza e, dentro dela, pela fonte (id). */
export async function arrecadadoPorNaturezaFonteMesAMes(prisma: Tx, ano: number): Promise<readonly ArrecadadoDaNaturezaEFonteNoAno[]> {
  const por = new Map<string, { naturezaCodigo: string; naturezaDescricao: string; fonteId: string; meses: Money[] }>();
  for (let mes = 1; mes <= 12; mes++) {
    const { inicio, fim } = janelaCivilDoMes(`${String(ano)}-${String(mes).padStart(2, "0")}`);
    for (const l of await arrecadadoPorNaturezaFonte(prisma, { desde: inicio, ate: fim })) {
      const chave = `${l.naturezaCodigo}|${l.fonteId}`;
      const acc = por.get(chave) ?? { naturezaCodigo: l.naturezaCodigo, naturezaDescricao: l.naturezaDescricao, fonteId: l.fonteId, meses: doze() };
      acc.meses[mes - 1] = toMoney((acc.meses[mes - 1] ?? toMoney("0.00")).plus(l.arrecadado));
      por.set(chave, acc);
    }
  }
  return [...por.values()]
    .map((l) => ({ ...l, ano, total: somar(l.meses) }))
    .sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo) || a.fonteId.localeCompare(b.fonteId));
}

export async function arrecadadoPorFonteMesAMes(prisma: Tx, anos: readonly number[]): Promise<readonly ArrecadadoDaFonteNoAno[]> {
  const saida: ArrecadadoDaFonteNoAno[] = [];
  for (const ano of [...anos].sort((a, b) => a - b)) {
    const porFonte = new Map<string, Money[]>();
    for (const l of await arrecadadoPorNaturezaFonteMesAMes(prisma, ano)) {
      const meses = porFonte.get(l.fonteId) ?? doze();
      l.meses.forEach((v, i) => {
        meses[i] = toMoney((meses[i] ?? toMoney("0.00")).plus(v));
      });
      porFonte.set(l.fonteId, meses);
    }
    for (const [fonteId, meses] of porFonte) saida.push({ fonteId, ano, meses, total: somar(meses) });
  }
  return saida;
}
