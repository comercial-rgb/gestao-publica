import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { anexo3 } from "./rreo-anexo3.js";
import type { Quadrimestre } from "./rgf-anexo1.js";

/**
 * A RCL AJUSTADA DO QUADRIMESTRE — o motor ÚNICO da família da dívida (RGF Anexos 2, 3 e 4).
 *
 * ═══ ⚠️ A REGRA SICONFI (o porquê deste arquivo) ═══
 * A RCL dos Anexos 1/2/3/4 do RGF tem de ser a MESMA RCL do RREO Anexo 3 do período — é regra
 * oficial de fechamento do Siconfi, não conveniência. Se cada anexo somasse a sua, o limite de
 * pessoal, o de dívida, o de garantias e o de operações de crédito mediriam contra receitas
 * diferentes, e o ente estaria dentro de um limite e fora de outro pela mesma verdade. Por isso a
 * RCL vem SEMPRE de `anexo3(...).rcl.total12m` — o motor único —, e este arquivo é o dono da
 * subtração das emendas.
 *
 * ⚠️ RCL AJUSTADA AQUI = RCL − emendas individuais (art. 166-A, §1º, CF). É a ajustada da FAMÍLIA
 * DA DÍVIDA (Anexos 2/3/4). NÃO confundir com a do Anexo 1 (pessoal), que deduz também emendas de
 * bancada e as transferências ACS/ACE — aquela é outra base, para outro limite.
 */
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface RclAjustada {
  /** A RCL (do RREO Anexo 3, linha III — o motor único). */
  readonly rcl: Money;
  /** (−) Transferências obrigatórias da União — emendas individuais. */
  readonly emendasIndividuais: Money;
  /** RCL − emendas individuais. */
  readonly rclAjustada: Money;
}

export async function rclAjustadaDoQuadrimestre(
  leitor: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<RclAjustada> {
  // O quadrimestre Q termina no fim do bimestre 2Q — a mesma janela de 12 meses do Anexo 3.
  const bimestre = (p.quadrimestre * 2) as 2 | 4 | 6;
  const a3 = await anexo3(leitor, { exercicio: p.exercicio, bimestre });

  const rcl = toMoney(a3.rcl.total12m);
  const emendasIndividuais = toMoney(
    a3.linhas.find((l) => l.chave === "EMENDAS_INDIVIDUAIS")?.total12m ?? "0.00"
  );
  const rclAjustada = toMoney(rcl.minus(emendasIndividuais));

  return { rcl, emendasIndividuais, rclAjustada };
}
