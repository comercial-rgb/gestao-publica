import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type { AoAnularLiquidacaoPort, M05Deps } from "../m05-despesa/ports.js";
import type { ContratoPort } from "../m05-despesa/ports.js";
import {
  aoAnularLiquidacaoParcial,
  aoAnularLiquidacaoTotal,
} from "./almoxarifado.js";

/**
 * O M10 IMPLEMENTANDO O `AoAnularLiquidacaoPort` QUE O M05 DECLAROU.
 *
 * Mesmo desenho do `ContratoPort` (M11) e do `AoAnularArrecadacaoPort` (M04): o dono da
 * PERGUNTA declara a interface; o dono da RESPOSTA a implementa. `m10 → m05` — a seta
 * aponta em uma direção só, e não há ciclo (o M05 só conhece a interface).
 */
export function criarAoAnularLiquidacaoPortPrisma(): AoAnularLiquidacaoPort {
  return {
    aoAnularTotal: (tx, liquidacaoId) => aoAnularLiquidacaoTotal(tx, liquidacaoId),
    aoAnularParcial: (tx, liquidacaoId, liquido) =>
      aoAnularLiquidacaoParcial(tx, liquidacaoId, liquido),
  };
}

/** As deps do M05 COM o almoxarifado ligado (a cascata da liquidação fechada). */
export function criarM05DepsComAlmoxarifado(
  prisma: PrismaClient,
  contratos?: ContratoPort
): M05Deps {
  return criarM05Deps(prisma, contratos, criarAoAnularLiquidacaoPortPrisma());
}
