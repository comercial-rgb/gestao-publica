import type { Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, fimDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { totaisPorTipo } from "./adapter-prisma.js";
import { reais } from "./documentos.js";
import { calcularSaldos } from "./dominio.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — O SALDO DA DOTAÇÃO NA DATA DE EMISSÃO DO EMPENHO (TR 5.10.1.10: "visualizar saldo da dotação atualizado até a
 * data de emissão do empenho e também até a data atual, não permitindo em nenhuma das duas situações que o valor do
 * empenho seja superior ao saldo da dotação").
 *
 * A data atual já era guardada (`exigirSaldo`, eixo CORRENTE). Esta é a outra metade: o eixo de COMPETÊNCIA até o fim
 * do dia civil da emissão — a dotação com os créditos e as anulações cuja data legal é até aquele dia, menos o
 * empenhado e o reservado com competência até ele. Um empenho datado de 10/03 não pode consumir um crédito
 * suplementar aberto em 20/03, ainda que hoje o disponível o cubra.
 *
 * ⚠️ O EMPENHO POR RESERVA FICA FORA DA GUARDA DA DATA. A reserva não tem data própria (a competência do movimento
 * dela é a da gravação, `competenciaDerivada`), e a liberação da reserva pelo empenho entra na data do empenho; o
 * corte por competência daria, entre as duas datas, um reservado negativo. Pendência nomeada:
 * SALDO-NA-DATA-DO-EMPENHO-POR-RESERVA (some quando a reserva ganhar data).
 */

export interface SaldoDaFichaNasDuasDatas {
  /** O disponível com os movimentos de competência até o fim do dia civil pedido. */
  readonly naData: Money;
  /** O disponível de agora (todos os movimentos) — o mesmo da lista de fichas. */
  readonly atual: Money;
}

export async function disponivelDaFichaNaData(tx: Tx, fichaId: string, dia: string): Promise<SaldoDaFichaNasDuasDatas> {
  const [naData, atual] = await Promise.all([
    totaisPorTipo(tx, fichaId, { eixo: "COMPETENCIA", ate: fimDoDiaCivil(dia) }),
    totaisPorTipo(tx, fichaId, { eixo: "CORRENTE" }),
  ]);
  return { naData: calcularSaldos(naData).disponivel, atual: calcularSaldos(atual).disponivel };
}

/**
 * A GUARDA, dentro da transação do empenho e DEPOIS da trava da ficha (quem chama já travou): o valor tem de caber no
 * disponível da data de emissão. Lança com o motivo; nada gravado.
 */
export async function exigirSaldoNaDataDoEmpenho(tx: Tx, p: { readonly fichaId: string; readonly data: Date; readonly valor: Money }): Promise<void> {
  const dia = diaCivil(p.data);
  const totais = await totaisPorTipo(tx, p.fichaId, { eixo: "COMPETENCIA", ate: fimDoDiaCivil(dia) });
  const disponivel = calcularSaldos(totais).disponivel;
  if (p.valor.greaterThan(disponivel)) {
    const ficha = await tx.fichaOrcamentaria.findUnique({ where: { id: p.fichaId }, select: { numero: true } });
    throw new Error(
      `Saldo insuficiente na ficha ${ficha === null ? p.fichaId : String(ficha.numero)} na data do empenho ` +
        `(${diaCivilBr(p.data)}): disponível naquela data ${reais(disponivel)}, solicitado ` +
        `${reais(p.valor)}. Crédito, anulação ou empenho com data posterior não conta para um empenho com data anterior. ` +
        `Nada foi gravado.`
    );
  }
}
