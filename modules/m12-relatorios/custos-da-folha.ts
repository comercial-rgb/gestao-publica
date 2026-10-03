import { toMoney, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoMes } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { centroDeCustoVigenteEm, type EventoDoVinculo } from "../m32-pessoal/dominio.js";
import { filtroDosContrachequesCobertos } from "../m33-folha/ir-da-folha.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V28 — O CUSTO DA FOLHA POR CENTRO DE CUSTO (`FOLHA-SEM-RATEIO-POR-CENTRO`).
 *
 * ═══ O QUE FALTAVA ═══
 * A maior massa de custo de um município é pessoal, e a folha liquidada não chegava a centro nenhum: o
 * operador só podia apropriar a liquidação inteira por um critério percentual declarado à mão, como se
 * fosse uma conta de luz. O dado certo já existia — cada vínculo tem centro de custo com histórico
 * (`HistoricoVinculo.centroDeCustoId`) — e o cálculo fechado diz quanto de cada vínculo está em cada
 * liquidação. Faltava o consumidor.
 *
 * ═══ A REGRA ═══
 * O valor de uma liquidação de folha se reparte pelos vínculos que ela cobre, pelos PROVENTOS das
 * rubricas do grupo de empenho no contracheque do FECHAMENTO (a mesma fonte do empenho e do atesto).
 * Cada vínculo vai ao centro de custo vigente no ÚLTIMO dia civil da competência. Vínculos do mesmo
 * centro somam. Nada é lançado no razão: custo é apropriação gerencial, como o resto do M12.
 *
 * ⚠️ FAIL-CLOSED, ANTES DE GRAVAR: vínculo sem centro de custo na competência recusa nomeando a
 * matrícula; a soma das partes tem de ser o valor da liquidação (senão o fechamento e o empenho
 * divergiram, e apropriar esconderia a divergência); liquidação com anulação parcial recusa — não há
 * como saber de qual vínculo saiu a anulação, e ratear pro rata seria escolher por quem não decidiu.
 *
 * ⚠️ IDEMPOTENTE: a folha se apropria UMA vez por liquidação, inteira. Repetir devolve a apropriação
 * existente sem gravar outra (a trava da liquidação serializa duas telas).
 */

export interface ResultadoDoCustoDaFolha {
  readonly apropriacaoId: string;
  readonly novo: boolean;
  readonly valor: Money;
  readonly partes: readonly { readonly centroId: string; readonly valor: Money }[];
}

export async function apropriarCustoDaFolha(
  prisma: PrismaClient,
  input: { readonly liquidacaoId: string; readonly criadoPor: string }
): Promise<ResultadoDoCustoDaFolha> {
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, input.criadoPor, ACAO_DO_SERVICO.apropriarCustoDaFolha, "ENTE");
    await travar(tx, "Liquidacao", [input.liquidacaoId]);

    const ld = await tx.liquidacaoDaFolha.findUnique({
      where: { liquidacaoId: input.liquidacaoId },
      select: {
        liquidacao: { select: { id: true, numero: true, valor: true } },
        empenhoDaFolha: {
          select: {
            vinculoId: true,
            grupo: { select: { codigo: true, porServidor: true, rubricas: { select: { rubricaId: true } } } },
            apropriacao: { select: { folha: { select: { competencia: true, fechamento: { select: { calculoId: true } } } } } },
          },
        },
      },
    });
    if (ld === null) {
      throw new Error("Esta liquidação não é de folha de pagamento. Aproprie o custo dela pelo critério de rateio. Nada foi gravado.");
    }
    const liq = ld.liquidacao;
    const e = ld.empenhoDaFolha;

    const existente = await tx.apropriacaoDeCusto.findFirst({
      where: { liquidacaoId: liq.id },
      select: { id: true, valor: true, criterioId: true, itens: { select: { centroId: true, valor: true } } },
    });
    if (existente !== null) {
      if (existente.criterioId !== null) {
        throw new Error(`A liquidação ${liq.numero} já tem custo apropriado por critério de rateio; a folha não é apropriada por cima. Nada foi gravado.`);
      }
      return {
        apropriacaoId: existente.id, novo: false, valor: toMoney(existente.valor.toFixed(2)),
        partes: existente.itens.map((i) => ({ centroId: i.centroId, valor: toMoney(i.valor.toFixed(2)) })),
      };
    }

    const familia = await tx.liquidacao.findMany({
      // V33 — e o estorno de cada parcial (aponta para a parcial): sem ele, a parcial estornada continuava descontando.
      where: { OR: [{ id: liq.id }, { estornoDeId: liq.id }, { anulacaoParcialDeId: liq.id }, { estornoDe: { anulacaoParcialDeId: liq.id } }] },
      select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
    });
    const liquido = somaLiquidaEstornaveis(familia.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
    const valorDaLiquidacao = toMoney(liq.valor.toFixed(2));
    if (!liquido.greaterThan(0)) {
      throw new Error(`A liquidação ${liq.numero} está anulada; não há custo a apropriar. Nada foi gravado.`);
    }
    if (!liquido.equals(valorDaLiquidacao)) {
      throw new Error(
        `A liquidação ${liq.numero} tem anulação parcial (vale ${liquido.toFixed(2)} de ${valorDaLiquidacao.toFixed(2)}), e não há ` +
          `como saber de qual servidor saiu a anulação. A apropriação por centro de custo da folha só vale para a liquidação ` +
          `inteira. Nada foi gravado.`
      );
    }

    const folha = e.apropriacao.folha;
    const calculoId = folha.fechamento?.calculoId;
    if (calculoId === undefined) throw new Error("A folha desta liquidação não está fechada. Nada foi gravado.");
    const rubricasDoGrupo = new Set(e.grupo.rubricas.map((r) => r.rubricaId));
    const contracheques = await tx.contracheque.findMany({
      where: filtroDosContrachequesCobertos(calculoId, e),
      select: {
        vinculo: {
          select: {
            matricula: true,
            eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, centroDeCustoId: true } },
          },
        },
        linhas: { where: { tipo: "PROVENTO" }, select: { rubricaId: true, valor: true } },
      },
    });

    // O último instante civil da competência: o centro de custo de maio é o de 31 de maio.
    const quando = janelaCivilDoMes(folha.competencia).fim;
    const porCentro = new Map<string, Money>();
    const semCentro: string[] = [];
    for (const c of contracheques) {
      const valor = c.linhas
        .filter((l) => rubricasDoGrupo.has(l.rubricaId))
        .reduce((s, l) => toMoney(s.plus(l.valor.toString())), toMoney("0.00"));
      if (!valor.greaterThan(0)) continue;
      const eventos = c.vinculo.eventos.map((x) => ({ ...x, salarioBase: x.salarioBase === null ? null : toMoney(x.salarioBase.toFixed(2)) })) as unknown as EventoDoVinculo[];
      const centro = centroDeCustoVigenteEm(eventos, quando);
      if (centro === null) {
        semCentro.push(c.vinculo.matricula);
        continue;
      }
      porCentro.set(centro, toMoney((porCentro.get(centro) ?? toMoney("0.00")).plus(valor)));
    }
    if (semCentro.length > 0) {
      throw new Error(
        `As matrículas ${semCentro.sort().join(", ")} não têm centro de custo na competência ${folha.competencia}; o custo delas não tem ` +
          `para onde ir. Registre o centro de custo no vínculo (Pessoal) e aproprie de novo. Nada foi gravado.`
      );
    }
    const soma = [...porCentro.values()].reduce((s, v) => toMoney(s.plus(v)), toMoney("0.00"));
    if (!soma.equals(valorDaLiquidacao)) {
      throw new Error(
        `Os proventos do grupo ${e.grupo.codigo} nos contracheques do fechamento somam ${soma.toFixed(2)}, e a liquidação ${liq.numero} ` +
          `vale ${valorDaLiquidacao.toFixed(2)}. O fechamento e a despesa divergem; apropriar esconderia a divergência. Nada foi gravado.`
      );
    }

    const partes = [...porCentro.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([centroId, valor]) => ({ centroId, valor }));
    const criada = await tx.apropriacaoDeCusto.create({
      data: {
        liquidacaoId: liq.id,
        criterioId: null,
        competencia: janelaCivilDoMes(folha.competencia).inicio,
        valor: valorDaLiquidacao.toFixed(2),
        motivo: `Folha ${folha.competencia}, grupo ${e.grupo.codigo}: custo repartido pelo centro de custo de cada vínculo.`,
        criadoPor: input.criadoPor,
        itens: { create: partes.map((p) => ({ centroId: p.centroId, valor: p.valor.toFixed(2) })) },
      },
      select: { id: true },
    });
    return { apropriacaoId: criada.id, novo: true, valor: valorDaLiquidacao, partes };
  });
}
