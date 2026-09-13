import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type {
  AoAnularLiquidacaoPort,
  AoLiquidarMaterialPort,
  M05Deps,
} from "../m05-despesa/ports.js";
import type { ContratoPort } from "../m05-despesa/ports.js";
import { toMoney } from "../../packages/contracts/money.js";
import { travar } from "../../packages/locks/index.js";
import {
  aoAnularLiquidacaoParcial,
  aoAnularLiquidacaoTotal,
  registrarEntradaAlmoxarifadoNaTx,
} from "./almoxarifado.js";
import { registrarEntradaFisicaNaTx } from "./estoque-fisico.js";

/**
 * O M10 IMPLEMENTANDO OS PORTS QUE O M05 DECLAROU.
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

/**
 * A ENTRADA NO ALMOXARIFADO QUE NASCE DA LIQUIDAÇÃO (ENT06 item 2).
 *
 * ⚠️ A SOMA DAS ENTRADAS TEM DE IGUALAR O LIQUIDADO, e é exatamente isto que só o ato
 * composto torna exigível. Com chamadas separadas — uma por classe, cada uma na sua
 * transação — a primeira entrada de 3.000 numa liquidação de 5.000 não tinha como falhar, e
 * o `MODULO.md` do M10 registrava o buraco. Aqui as classes chegam JUNTAS: ou somam o
 * liquidado, ou a liquidação inteira aborta.
 *
 * ⚠️ E O EIXO FÍSICO ENTRA NA MESMA TRANSAÇÃO, quando informado. Ele é opcional porque o
 * eixo contábil já explica a conta de estoque; quem controla depósito ganha quantidade,
 * lote e preço médio no mesmo ato, sem uma segunda tela e sem um segundo instante em que os
 * dois eixos poderiam divergir.
 */
export function criarAoLiquidarMaterialPortPrisma(): AoLiquidarMaterialPort {
  return {
    async aoLiquidarMaterial(tx, p): Promise<void> {
      let soma = toMoney("0.00");
      for (const e of p.entradas) soma = toMoney(soma.plus(e.valor));

      if (!soma.equals(p.valorDaLiquidacao)) {
        throw new Error(
          `AS ENTRADAS DE MATERIAL NÃO FECHAM COM A LIQUIDAÇÃO: ela liquidou ` +
            `${p.valorDaLiquidacao.toFixed(2)} e as ${p.entradas.length} entrada(s) somam ` +
            `${soma.toFixed(2)}. Liquidar material é um ato só com dar entrada dele — a ` +
            `diferença viraria estoque no razão que nenhum movimento explica, e a ` +
            `amarração razão × almoxarifado passaria a acusar divergência para sempre. ` +
            `Nada foi gravado.`
        );
      }

      // A LIQUIDAÇÃO É TRAVADA UMA VEZ (posto 6), antes de qualquer classe (posto 11) — a ordem dos locks.
      await travar(tx, "Liquidacao", [p.liquidacaoId]);
      for (const e of p.entradas) {
        const { movimentoId } = await registrarEntradaAlmoxarifadoNaTx(
          tx,
          {
            classeDeMaterialId: e.classeDeMaterialId,
            liquidacaoId: p.liquidacaoId,
            valor: e.valor,
            dataMovimento: p.dataMovimento,
            criadoPor: p.criadoPor,
          },
          { liquidacaoJaTravada: true }
        );

        if (e.fisica === undefined) continue;

        // ⚠️ AMARRADA AO MOVIMENTO CONTÁBIL que acabou de nascer: é o `movimentoAlmoxarifadoId`
        // que impede o eixo físico de inflar o estoque que o razão registrou. Sem ele, as duas
        // leituras do mesmo estoque poderiam divergir sem que nada acusasse.
        await registrarEntradaFisicaNaTx(tx, {
          materialId: e.fisica.materialId,
          depositoId: e.fisica.depositoId,
          quantidade: e.fisica.quantidade,
          // ⚠️ O SCHEMA DA ENTRADA FÍSICA RECEBE `string | number` e converte por dentro —
          // ele é a fronteira onde o dinheiro da borda vira `Decimal`. Seis casas porque é
          // a precisão com que o serviço trabalha o unitário depois de dividi-lo pelo fator
          // da unidade; menos que isso perderia centavo em material comprado por milheiro.
          valorUnitario: e.fisica.valorUnitario.toFixed(6),
          dataMovimento: p.dataMovimento,
          movimentoAlmoxarifadoId: movimentoId,
          motivo: `Entrada da liquidação, classe ${e.classeDeMaterialId}`,
          criadoPor: p.criadoPor,
          ...(e.fisica.unidadeDeMedidaId !== undefined
            ? { unidadeDeMedidaId: e.fisica.unidadeDeMedidaId }
            : {}),
          ...(e.fisica.loteIdentificacao !== undefined
            ? { loteIdentificacao: e.fisica.loteIdentificacao }
            : {}),
          ...(e.fisica.loteValidade !== undefined
            ? { loteValidade: e.fisica.loteValidade }
            : {}),
          ...(e.fisica.recebimentoDeItemId !== undefined
            ? { recebimentoDeItemId: e.fisica.recebimentoDeItemId }
            : {}),
        });
      }
    },
  };
}

/** As deps do M05 COM o almoxarifado ligado — a cascata da anulação e a entrada da liquidação. */
export function criarM05DepsComAlmoxarifado(
  prisma: PrismaClient,
  contratos?: ContratoPort
): M05Deps {
  return criarM05Deps(
    prisma,
    contratos,
    criarAoAnularLiquidacaoPortPrisma(),
    criarAoLiquidarMaterialPortPrisma()
  );
}
