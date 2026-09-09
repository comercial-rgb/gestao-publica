import { cliente, PortaSemBancoError } from "./cliente";
import { demonstrativoPatrimonialPorClasse } from "../../modules/m10-patrimonial/demonstrativo";
import { saldoDaDividaPorTipo } from "../../modules/m10-patrimonial/consultas";

/**
 * PORTA — PATRIMÔNIO (M10, TR 5.82–5.86). A tela consome ISTO (grep trivalente). LEITURA: a posição
 * patrimonial por classe (5.86 — saldo anterior + ingressos + atualizações = saldo final, por SUM
 * dos MovimentoPatrimonial) e o saldo da dívida consolidada por tipo — o MESMO dono que o RGF Anexo 2
 * já lê. NÃO recalcula nada: encaminha os reads do M10.
 */

export { PortaSemBancoError };
export type { DemonstrativoPatrimonial } from "../../modules/m10-patrimonial/demonstrativo";

/** A posição patrimonial por classe do exercício (TR 5.86). */
export async function lerPosicaoPatrimonial(p: { readonly exercicio: number }) {
  return demonstrativoPatrimonialPorClasse(cliente(), p.exercicio);
}

export interface DividaPorTipoDaTela {
  readonly mobiliaria: string;
  readonly contratual: string;
  readonly total: string;
}

/** O saldo da dívida consolidada por tipo, no corte do exercício (o dono do RGF Anexo 2). */
export async function lerDividas(p: { readonly exercicio: number }): Promise<DividaPorTipoDaTela> {
  const corte = new Date(Date.UTC(p.exercicio, 11, 31, 23, 59, 59));
  const s = await saldoDaDividaPorTipo(cliente(), { corte });
  return { mobiliaria: s.mobiliaria.toFixed(2), contratual: s.contratual.toFixed(2), total: s.total.toFixed(2) };
}
