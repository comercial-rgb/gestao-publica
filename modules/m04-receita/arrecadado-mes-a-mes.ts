import { toMoney, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoMes } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { arrecadadoPorNaturezaFonte } from "./consultas.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — A RECEITA ARRECADADA MÊS A MÊS, POR FONTE, DE VÁRIOS EXERCÍCIOS (TR 5.10.2.60: os últimos três anos, com as
 * fontes de recursos e emissão em planilha).
 *
 * ⚠️ A MESMA ARITMÉTICA, OUTRA CHAVE. Cada mês é `arrecadadoPorNaturezaFonte` na janela civil do mês (o sinal da
 * anulação, a guia repartida entre fontes e o corte pela data do fato são de lá); aqui só se soma por fonte. Nenhum
 * laço de sinal novo.
 */

export interface ArrecadadoDaFonteNoAno {
  readonly fonteId: string;
  readonly ano: number;
  /** Doze posições, janeiro a dezembro. */
  readonly meses: readonly Money[];
  readonly total: Money;
}

export async function arrecadadoPorFonteMesAMes(prisma: Tx, anos: readonly number[]): Promise<readonly ArrecadadoDaFonteNoAno[]> {
  const saida: ArrecadadoDaFonteNoAno[] = [];
  for (const ano of [...anos].sort((a, b) => a - b)) {
    const porFonte = new Map<string, Money[]>();
    for (let mes = 1; mes <= 12; mes++) {
      const { inicio, fim } = janelaCivilDoMes(`${String(ano)}-${String(mes).padStart(2, "0")}`);
      for (const l of await arrecadadoPorNaturezaFonte(prisma, { desde: inicio, ate: fim })) {
        const meses = porFonte.get(l.fonteId) ?? Array.from({ length: 12 }, () => toMoney("0.00"));
        meses[mes - 1] = toMoney((meses[mes - 1] ?? toMoney("0.00")).plus(l.arrecadado));
        porFonte.set(l.fonteId, meses);
      }
    }
    for (const [fonteId, meses] of porFonte) {
      saida.push({ fonteId, ano, meses, total: meses.reduce((s, m) => toMoney(s.plus(m)), toMoney("0.00")) });
    }
  }
  return saida;
}
