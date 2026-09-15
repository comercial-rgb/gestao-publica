import { Decimal, sumMoney, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { VisaoDoContrato } from "./fiscalizacao.js";
import { elegivelDoItemMedido } from "./ordem-de-servico.js";
import { consumoDasParcelas } from "./parcelas-da-liquidacao.js";

/**
 * ═══ M11 — A EXECUÇÃO DO CONTRATO: ordens, medições, recebimentos e saldos (V7 M2 U1/U2) ═══
 *
 * Leitura. A projeção é decidida ANTES, por `alcanceNoContrato`: na visão FINANCEIRA não saem o motivo da
 * controvérsia, as verificações do termo provisório, nem o fundamento das decisões — só quantidades, valores,
 * situação e a identidade (número, data, sha256) dos termos que lastreiam a liquidação.
 *
 * ⚠️ NENHUM NÚMERO É SOMADO ENTRE UNIDADES DIFERENTES. Quantidades ficam por item; os totais são de VALOR.
 * ⚠️ Cada valor tem a sua definição: AUTORIZADO (ordens emitidas, líquido de cancelamentos, × unitário da ordem),
 * MEDIDO (medições da ordem), RECEBIDO (recebimentos definitivos), LIQUIDADO (o que as liquidações vivas do M05
 * consumiram das parcelas recebidas). Nenhum é derivado do outro, e nenhum é pagamento.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const q = (d: Decimal.Value): string => new Decimal(d).toFixed(4);

export type SituacaoDaOrdem = "RASCUNHO" | "DESCARTADA" | "EMITIDA" | "SUSPENSA";

export interface ItemDaOrdemNaTela {
  readonly id: string;
  readonly item: number;
  readonly descricao: string;
  readonly unidade: string;
  readonly valorUnitario: string;
  readonly quantidade: string;
  readonly cancelado: string;
  readonly autorizado: string;
  readonly medido: string;
  readonly aExecutar: string;
}

export interface ItemMedidoNaTela {
  readonly id: string;
  readonly item: number;
  readonly descricao: string;
  readonly unidade: string;
  readonly valorUnitario: string;
  readonly medido: string;
  readonly conferenciaId: string | null;
  readonly conforme: string | null;
  readonly emControversia: string | null;
  /** Só na visão de fiscalização. */
  readonly motivo: string | null;
  readonly decisao: { readonly resultado: "ACEITA" | "REJEITADA"; readonly fundamento: string | null; readonly data: string; readonly sha256: string } | null;
  readonly recebido: string;
  readonly elegivel: string;
  readonly pendenteDeDecisao: string;
  readonly glosado: string;
}

export interface MedicaoDaOrdemNaTela {
  readonly id: string;
  readonly numero: number;
  readonly periodo: string;
  readonly fiscal: string;
  readonly itens: readonly ItemMedidoNaTela[];
  readonly provisorio: { readonly id: string; readonly data: string; readonly por: string; readonly sha256: string; readonly verificacoes: string | null } | null;
  readonly definitivos: readonly { readonly id: string; readonly numero: number; readonly data: string; readonly por: string; readonly valor: string; readonly liquidado: string; readonly aLiquidar: string; readonly sha256: string }[];
  readonly valores: { readonly medido: string; readonly conforme: string; readonly emControversia: string; readonly aceito: string; readonly glosado: string; readonly recebido: string; readonly liquidado: string };
}

export interface OrdemNaTela {
  readonly id: string;
  readonly numero: number;
  readonly ano: number;
  readonly situacao: SituacaoDaOrdem;
  readonly finalidade: string;
  readonly local: string | null;
  readonly unidadeSolicitante: string | null;
  readonly inicioPrevisto: string;
  readonly fimPrevisto: string;
  readonly inicioAutorizado: string | null;
  readonly emitidaEm: string | null;
  readonly sha256: string | null;
  readonly condicoesDeRecebimento: string;
  readonly gestor: string;
  readonly fiscal: string;
  readonly fiscalDesignacaoId: string;
  readonly empenho: { readonly id: string; readonly numero: string } | null;
  readonly itens: readonly ItemDaOrdemNaTela[];
  readonly medicoes: readonly MedicaoDaOrdemNaTela[];
  readonly movimentos: readonly { readonly tipo: "SUSPENSAO" | "RETOMADA"; readonly data: string; readonly motivo: string }[];
  readonly cancelamentos: readonly { readonly item: number; readonly quantidade: string; readonly data: string; readonly motivo: string }[];
  readonly valores: { readonly previsto: string; readonly autorizado: string; readonly medido: string; readonly recebido: string; readonly liquidado: string };
}

export interface ExecucaoDoContrato {
  readonly visao: VisaoDoContrato;
  readonly itensDoContrato: readonly { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string; readonly valorUnitario: string; readonly contratado: string; readonly autorizadoEmOrdens: string; readonly medidoSemOrdem: string; readonly aAutorizar: string }[];
  readonly ordens: readonly OrdemNaTela[];
  readonly totais: { readonly autorizado: string; readonly medido: string; readonly recebido: string; readonly liquidado: string };
}

const nome = (d: { readonly atoDesignacao: string; readonly pessoa: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] } }): string => `${d.pessoa.versoes[0]?.nome ?? d.pessoa.documento} (${d.atoDesignacao})`;
const PESSOA = { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } } } };

export async function execucaoDoContrato(prisma: Tx, contratoId: string, visao: VisaoDoContrato): Promise<ExecucaoDoContrato> {
  const fiscalizacao = visao === "FISCALIZACAO";
  const [itensDoContrato, ordens] = await Promise.all([
    prisma.itemDoContrato.findMany({
      where: { contratoId },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, descricao: true, unidade: true, quantidade: true, valorUnitario: true, medidos: { select: { quantidade: true } }, itensDeOrdemDeServico: { where: { ordem: { emissao: { isNot: null } } }, select: { quantidade: true, cancelamentos: { select: { quantidade: true } } } } },
    }),
    prisma.ordemDeServicoDoContrato.findMany({
      where: { contratoId },
      orderBy: { numero: "desc" },
      select: {
        id: true, numero: true, ano: true, finalidade: true, local: true, unidadeSolicitante: true, inicioPrevisto: true, fimPrevisto: true, condicoesDeRecebimento: true, fiscalDesignacaoId: true,
        gestorDesignacao: PESSOA, fiscalDesignacao: PESSOA,
        empenho: { select: { id: true, numero: true } },
        emissao: { select: { data: true, inicioAutorizado: true, sha256: true } },
        descarte: { select: { id: true } },
        movimentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { tipo: true, data: true, motivo: true } },
        itens: { orderBy: { itemDoContrato: { numero: "asc" } }, select: { id: true, quantidade: true, valorUnitario: true, itemDoContrato: { select: { numero: true, descricao: true, unidade: true } }, cancelamentos: { orderBy: { criadoEm: "asc" }, select: { quantidade: true, data: true, motivo: true } }, medidos: { select: { quantidade: true } } } },
        medicoes: {
          orderBy: { numero: "desc" },
          select: {
            id: true, numero: true, periodoInicio: true, periodoFim: true, designacao: PESSOA,
            itens: {
              orderBy: { itemDaOrdem: { itemDoContrato: { numero: "asc" } } },
              select: {
                id: true, quantidade: true, valorUnitario: true, valor: true,
                itemDaOrdem: { select: { itemDoContrato: { select: { numero: true, descricao: true, unidade: true } } } },
                conferencia: { select: { id: true, quantidadeConforme: true, quantidadeEmControversia: true, motivo: true, decisao: { select: { resultado: true, fundamento: true, data: true, sha256: true } } } },
                recebidos: { select: { quantidade: true } },
              },
            },
            recebimentoProvisorio: { select: { id: true, data: true, sha256: true, verificacoes: true, designacao: PESSOA } },
            recebimentosDefinitivos: { orderBy: { numero: "asc" }, select: { id: true, numero: true, data: true, sha256: true, designacao: PESSOA, itens: { select: { valor: true } } } },
          },
        },
      },
    }),
  ]);

  const consumo = await consumoDasParcelas(prisma, ordens.flatMap((o) => o.medicoes.flatMap((m) => m.recebimentosDefinitivos.map((r) => r.id))));
  const saidaOrdens: OrdemNaTela[] = ordens.map((o) => {
    const itens = o.itens.map((i) => {
      const cancelado = i.cancelamentos.reduce((t, c) => t.plus(c.quantidade.toFixed(4)), new Decimal(0));
      const medido = i.medidos.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0));
      const autorizado = new Decimal(i.quantidade.toFixed(4)).minus(cancelado);
      return { id: i.id, item: i.itemDoContrato.numero, descricao: i.itemDoContrato.descricao, unidade: i.itemDoContrato.unidade, valorUnitario: q(i.valorUnitario.toFixed(4)), quantidade: q(i.quantidade.toFixed(4)), cancelado: q(cancelado), autorizado: q(autorizado), medido: q(medido), aExecutar: q(autorizado.minus(medido)) };
    });
    const medicoes: MedicaoDaOrdemNaTela[] = o.medicoes.map((m) => {
      const its = m.itens.map((i) => {
        const e = elegivelDoItemMedido(i as never);
        const unit = i.valorUnitario.toFixed(4);
        return {
          linha: {
            id: i.id, item: i.itemDaOrdem.itemDoContrato.numero, descricao: i.itemDaOrdem.itemDoContrato.descricao, unidade: i.itemDaOrdem.itemDoContrato.unidade, valorUnitario: q(unit), medido: q(i.quantidade.toFixed(4)),
            conferenciaId: i.conferencia?.id ?? null,
            conforme: i.conferencia === null ? null : q(i.conferencia.quantidadeConforme.toFixed(4)),
            emControversia: i.conferencia === null ? null : q(i.conferencia.quantidadeEmControversia.toFixed(4)),
            motivo: fiscalizacao ? (i.conferencia?.motivo ?? null) : null,
            decisao: i.conferencia?.decisao == null ? null : { resultado: i.conferencia.decisao.resultado, fundamento: fiscalizacao ? i.conferencia.decisao.fundamento : null, data: diaCivilBr(i.conferencia.decisao.data), sha256: i.conferencia.decisao.sha256 },
            recebido: q(e.recebido), elegivel: q(e.elegivel), pendenteDeDecisao: q(e.pendenteDeDecisao), glosado: q(e.glosado),
          } satisfies ItemMedidoNaTela,
          valores: {
            medido: toMoney(i.valor.toFixed(2)),
            conforme: i.conferencia === null ? toMoney(0) : toMoney(new Decimal(i.conferencia.quantidadeConforme.toFixed(4)).times(unit)),
            emControversia: toMoney(e.pendenteDeDecisao.times(unit)),
            aceito: i.conferencia?.decisao?.resultado === "ACEITA" ? toMoney(new Decimal(i.conferencia.quantidadeEmControversia.toFixed(4)).times(unit)) : toMoney(0),
            glosado: toMoney(e.glosado.times(unit)),
          },
        };
      });
      const recebido = sumMoney(m.recebimentosDefinitivos.flatMap((r) => r.itens.map((x) => x.valor.toFixed(2))));
      return {
        id: m.id, numero: m.numero, periodo: `${diaCivilBr(m.periodoInicio)} a ${diaCivilBr(m.periodoFim)}`, fiscal: nome(m.designacao),
        itens: its.map((x) => x.linha),
        provisorio: m.recebimentoProvisorio === null ? null : { id: m.recebimentoProvisorio.id, data: diaCivilBr(m.recebimentoProvisorio.data), por: nome(m.recebimentoProvisorio.designacao), sha256: m.recebimentoProvisorio.sha256, verificacoes: fiscalizacao ? m.recebimentoProvisorio.verificacoes : null },
        definitivos: m.recebimentosDefinitivos.map((r) => {
          const valor = sumMoney(r.itens.map((x) => x.valor.toFixed(2)));
          const liquidado = toMoney((consumo.get(r.id) ?? new Decimal(0)).toFixed(2));
          return { id: r.id, numero: r.numero, data: diaCivilBr(r.data), por: nome(r.designacao), valor: valor.toFixed(2), liquidado: liquidado.toFixed(2), aLiquidar: toMoney(valor.minus(liquidado)).toFixed(2), sha256: r.sha256 };
        }),
        valores: {
          medido: sumMoney(its.map((x) => x.valores.medido)).toFixed(2),
          conforme: sumMoney(its.map((x) => x.valores.conforme)).toFixed(2),
          emControversia: sumMoney(its.map((x) => x.valores.emControversia)).toFixed(2),
          aceito: sumMoney(its.map((x) => x.valores.aceito)).toFixed(2),
          glosado: sumMoney(its.map((x) => x.valores.glosado)).toFixed(2),
          recebido: recebido.toFixed(2),
          liquidado: sumMoney(m.recebimentosDefinitivos.map((r) => toMoney((consumo.get(r.id) ?? new Decimal(0)).toFixed(2)))).toFixed(2),
        },
      };
    });
    const ultimo = o.movimentos[o.movimentos.length - 1];
    const situacao: SituacaoDaOrdem = o.descarte !== null ? "DESCARTADA" : o.emissao === null ? "RASCUNHO" : ultimo?.tipo === "SUSPENSAO" ? "SUSPENSA" : "EMITIDA";
    const emitida = o.emissao !== null;
    const previsto = sumMoney(o.itens.map((i) => toMoney(new Decimal(i.quantidade.toFixed(4)).times(i.valorUnitario.toFixed(4)))));
    const autorizado = !emitida ? toMoney(0) : sumMoney(itens.map((i) => toMoney(new Decimal(i.autorizado).times(i.valorUnitario))));
    return {
      id: o.id, numero: o.numero, ano: o.ano, situacao, finalidade: o.finalidade, local: o.local, unidadeSolicitante: o.unidadeSolicitante,
      inicioPrevisto: diaCivilBr(o.inicioPrevisto), fimPrevisto: diaCivilBr(o.fimPrevisto), inicioAutorizado: o.emissao === null ? null : diaCivilBr(o.emissao.inicioAutorizado), emitidaEm: o.emissao === null ? null : diaCivilBr(o.emissao.data), sha256: o.emissao?.sha256 ?? null,
      condicoesDeRecebimento: o.condicoesDeRecebimento, gestor: nome(o.gestorDesignacao), fiscal: nome(o.fiscalDesignacao), fiscalDesignacaoId: o.fiscalDesignacaoId,
      empenho: o.empenho === null ? null : { id: o.empenho.id, numero: o.empenho.numero },
      itens, medicoes,
      movimentos: o.movimentos.map((x) => ({ tipo: x.tipo, data: diaCivilBr(x.data), motivo: x.motivo })),
      cancelamentos: o.itens.flatMap((i) => i.cancelamentos.map((c) => ({ item: i.itemDoContrato.numero, quantidade: q(c.quantidade.toFixed(4)), data: diaCivil(c.data).split("-").reverse().join("/"), motivo: c.motivo }))),
      valores: { previsto: previsto.toFixed(2), autorizado: autorizado.toFixed(2), medido: sumMoney(medicoes.map((m) => m.valores.medido)).toFixed(2), recebido: sumMoney(medicoes.map((m) => m.valores.recebido)).toFixed(2), liquidado: sumMoney(medicoes.map((m) => m.valores.liquidado)).toFixed(2) },
    };
  });

  return {
    visao,
    itensDoContrato: itensDoContrato.map((i) => {
      const autorizadoEmOrdens = i.itensDeOrdemDeServico.reduce((t, o) => t.plus(o.quantidade.toFixed(4)).minus(o.cancelamentos.reduce((u, c) => u.plus(c.quantidade.toFixed(4)), new Decimal(0))), new Decimal(0));
      const medidoSemOrdem = i.medidos.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0));
      return { id: i.id, numero: i.numero, descricao: i.descricao, unidade: i.unidade, valorUnitario: q(i.valorUnitario.toFixed(4)), contratado: q(i.quantidade.toFixed(4)), autorizadoEmOrdens: q(autorizadoEmOrdens), medidoSemOrdem: q(medidoSemOrdem), aAutorizar: q(new Decimal(i.quantidade.toFixed(4)).minus(autorizadoEmOrdens).minus(medidoSemOrdem)) };
    }),
    ordens: saidaOrdens,
    totais: {
      autorizado: sumMoney(saidaOrdens.map((o) => o.valores.autorizado)).toFixed(2),
      medido: sumMoney(saidaOrdens.map((o) => o.valores.medido)).toFixed(2),
      recebido: sumMoney(saidaOrdens.map((o) => o.valores.recebido)).toFixed(2),
      liquidado: sumMoney(saidaOrdens.map((o) => o.valores.liquidado)).toFixed(2),
    },
  };
}
