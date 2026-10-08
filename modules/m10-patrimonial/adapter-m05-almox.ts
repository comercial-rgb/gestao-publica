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
import { estornarEntradasFisicasDaLiquidacaoNaTx, registrarEntradaFisicaNaTx } from "./estoque-fisico.js";

/**
 * O M10 IMPLEMENTANDO OS PORTS QUE O M05 DECLAROU.
 *
 * Mesmo desenho do `ContratoPort` (M11) e do `AoAnularArrecadacaoPort` (M04): o dono da
 * PERGUNTA declara a interface; o dono da RESPOSTA a implementa. `m10 → m05` — a seta
 * aponta em uma direção só, e não há ciclo (o M05 só conhece a interface).
 */
export function criarAoAnularLiquidacaoPortPrisma(): AoAnularLiquidacaoPort {
  return {
    // V37 — o eixo CONTÁBIL (classes, posto 13) e depois o FÍSICO (posições, posto 23): a ordem dos locks, e os dois
    // eixos voltando juntos na mesma transação (antes, só o contábil voltava).
    aoAnularTotal: async (tx, liquidacaoId) => {
      await aoAnularLiquidacaoTotal(tx, liquidacaoId);
      await estornarEntradasFisicasDaLiquidacaoNaTx(tx, liquidacaoId);
    },
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

      // A LIQUIDAÇÃO É TRAVADA UMA VEZ (posto 7), antes de qualquer classe (posto 12) — a ordem dos locks.
      await travar(tx, "Liquidacao", [p.liquidacaoId]);

      // ⚠️ V37 — DUAS PASSADAS, NÃO LINHA A LINHA. A entrada contábil trava a CLASSE (posto 13) e a física a POSIÇÃO
      // de estoque (posto 23); linha a linha, a classe da segunda linha vinha depois da posição da primeira, e a guarda
      // de ordem recusava toda liquidação com duas linhas físicas (t9b do estoque físico). Primeiro todas as classes,
      // depois todas as posições — cada passada na ordem da chave da trava, para duas liquidações concorrentes pegarem
      // as mesmas travas na mesma sequência.
      const indices = p.entradas.map((_, i) => i);
      // A régua do `travar` (ordem de código, não de idioma); empate fica na ordem da tela.
      const porTexto = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
      const movimentoDaLinha = new Map<number, string>();
      for (const i of [...indices].sort((a, b) => porTexto(p.entradas[a]!.classeDeMaterialId, p.entradas[b]!.classeDeMaterialId) || a - b)) {
        const e = p.entradas[i]!;
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
        movimentoDaLinha.set(i, movimentoId);
      }

      const chave = (i: number): string => `${p.entradas[i]!.fisica?.materialId ?? ""}:${p.entradas[i]!.fisica?.depositoId ?? ""}`;
      for (const i of indices.filter((j) => p.entradas[j]!.fisica !== undefined).sort((a, b) => porTexto(chave(a), chave(b)) || a - b)) {
        const e = p.entradas[i]!;
        const fisica = e.fisica!;
        const movimentoId = movimentoDaLinha.get(i)!;

        await registrarEntradaFisicaNaTx(tx, {
          materialId: fisica.materialId,
          depositoId: fisica.depositoId,
          quantidade: fisica.quantidade,
          // ⚠️ O SCHEMA DA ENTRADA FÍSICA RECEBE `string | number` e converte por dentro —
          // ele é a fronteira onde o dinheiro da borda vira `Decimal`. Seis casas porque é
          // a precisão com que o serviço trabalha o unitário depois de dividi-lo pelo fator
          // da unidade; menos que isso perderia centavo em material comprado por milheiro.
          valorUnitario: fisica.valorUnitario.toFixed(6),
          dataMovimento: p.dataMovimento,
          movimentoAlmoxarifadoId: movimentoId,
          motivo: `Entrada da liquidação, classe ${e.classeDeMaterialId}`,
          criadoPor: p.criadoPor,
          ...(fisica.unidadeDeMedidaId !== undefined
            ? { unidadeDeMedidaId: fisica.unidadeDeMedidaId }
            : {}),
          ...(fisica.loteIdentificacao !== undefined
            ? { loteIdentificacao: fisica.loteIdentificacao }
            : {}),
          ...(fisica.loteValidade !== undefined
            ? { loteValidade: fisica.loteValidade }
            : {}),
          ...(fisica.recebimentoDeItemId !== undefined
            ? { recebimentoDeItemId: fisica.recebimentoDeItemId }
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
