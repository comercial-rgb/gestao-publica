import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { serializar, toMoney, type Money } from "../../packages/contracts/index.js";
import { SINAL_MOVIMENTO_DIVIDA } from "../../modules/m10-patrimonial/divida";
import { comparativoDaDivida, informarParcelasDaDivida, substituirParcelaDaDivida } from "../../modules/m10-patrimonial/parcelas-da-divida";
import { lerCronogramaColado } from "../../modules/m10-patrimonial/cronograma-colado";

/**
 * V36 — O RELATÓRIO GERENCIAL DA DÍVIDA FUNDADA (TR 5.10.1.86) E AS PARCELAS INFORMADAS (TR 5.10.1.84).
 *
 * Todas as dívidas: ingressado, atualizado, amortizado e saldo, da MESMA soma de movimentos com o sinal de
 * `SINAL_MOVIMENTO_DIVIDA` (o estorno soma com o sinal dele, como em `saldoDaDivida`). Uma dívida: o comparativo do
 * M10 (parcelas informadas × amortizado no período de cada uma). Dinheiro sai como string decimal.
 */

export interface DividaDoRelatorio {
  readonly id: string;
  readonly identificador: string;
  readonly credorNome: string;
  readonly tipo: "CONTRATUAL" | "MOBILIARIA";
  readonly leiAutorizativa: string;
  readonly objeto: string;
  readonly ingressado: string;
  readonly atualizado: string;
  readonly amortizado: string;
  readonly saldo: string;
  readonly parcelasInformadas: number;
}

export interface LinhaDoComparativoNaTela {
  readonly parcelaId: string | null;
  readonly numero: number | null;
  readonly vencimento: string | null;
  readonly principalInformado: string;
  readonly encargosInformados: string | null;
  readonly amortizadoNoPeriodo: string;
  readonly diferenca: string;
  readonly corrigida: boolean;
}

export interface RelatorioDaDivida {
  readonly dividas: readonly DividaDoRelatorio[];
  readonly totais: { readonly ingressado: string; readonly atualizado: string; readonly amortizado: string; readonly saldo: string };
  readonly escolhida: (DividaDoRelatorio & {
    readonly linhas: readonly LinhaDoComparativoNaTela[];
    readonly totalInformado: string;
    readonly totalAmortizadoNasLinhas: string;
  }) | null;
}

const zero = (): Money => toMoney("0.00");

export async function lerRelatorioDaDivida(p: { readonly dividaId?: string }): Promise<RelatorioDaDivida> {
  await exigirLeituraDoEnte("CONSULTAR_DIVIDA");
  const prisma = cliente();
  const dividas = await prisma.dividaConsolidada.findMany({
    orderBy: { identificador: "asc" },
    select: {
      id: true, identificador: true, credorNome: true, tipo: true, leiAutorizativa: true, objeto: true,
      movimentos: { select: { tipo: true, valor: true } },
      _count: { select: { parcelas: { where: { substituidaPor: null } } } },
    },
  });
  const t = { ingressado: zero(), atualizado: zero(), amortizado: zero(), saldo: zero() };
  const linhas: DividaDoRelatorio[] = dividas.map((d) => {
    const s = { ingressado: zero(), atualizado: zero(), amortizado: zero(), saldo: zero() };
    for (const m of d.movimentos) {
      const v = toMoney(m.valor.toFixed(2));
      const comSinal = SINAL_MOVIMENTO_DIVIDA[m.tipo] === 1 ? v : toMoney(v.negated());
      s.saldo = toMoney(s.saldo.plus(comSinal));
      if (m.tipo === "INGRESSO_OPERACAO_CREDITO" || m.tipo === "ESTORNO_INGRESSO_OPERACAO_CREDITO") s.ingressado = toMoney(s.ingressado.plus(comSinal));
      else if (m.tipo === "ATUALIZACAO_MONETARIA" || m.tipo === "ESTORNO_ATUALIZACAO_MONETARIA") s.atualizado = toMoney(s.atualizado.plus(comSinal));
      // A amortização reduz o saldo: no relatório ela aparece como valor positivo amortizado.
      else s.amortizado = toMoney(s.amortizado.minus(comSinal));
    }
    t.ingressado = toMoney(t.ingressado.plus(s.ingressado));
    t.atualizado = toMoney(t.atualizado.plus(s.atualizado));
    t.amortizado = toMoney(t.amortizado.plus(s.amortizado));
    t.saldo = toMoney(t.saldo.plus(s.saldo));
    return {
      id: d.id, identificador: d.identificador, credorNome: d.credorNome, tipo: d.tipo, leiAutorizativa: d.leiAutorizativa, objeto: d.objeto,
      ingressado: serializar(s.ingressado), atualizado: serializar(s.atualizado), amortizado: serializar(s.amortizado), saldo: serializar(s.saldo),
      parcelasInformadas: d._count.parcelas,
    };
  });

  let escolhida: RelatorioDaDivida["escolhida"] = null;
  const alvo = p.dividaId === undefined || p.dividaId === "" ? null : linhas.find((d) => d.id === p.dividaId) ?? null;
  if (p.dividaId !== undefined && p.dividaId !== "" && alvo === null) throw new Error("A dívida pedida não existe.");
  if (alvo !== null) {
    const c = await comparativoDaDivida(prisma, alvo.id);
    escolhida = {
      ...alvo,
      linhas: c.linhas.map((l) => ({
        parcelaId: l.parcelaId, numero: l.numero, vencimento: l.vencimento,
        principalInformado: serializar(l.principalInformado),
        encargosInformados: l.encargosInformados === null ? null : serializar(l.encargosInformados),
        amortizadoNoPeriodo: serializar(l.amortizadoNoPeriodo), diferenca: serializar(l.diferenca), corrigida: l.corrigida,
      })),
      totalInformado: serializar(c.totalInformado),
      totalAmortizadoNasLinhas: serializar(c.totalAmortizado),
    };
  }
  return {
    dividas: linhas,
    totais: { ingressado: serializar(t.ingressado), atualizado: serializar(t.atualizado), amortizado: serializar(t.amortizado), saldo: serializar(t.saldo) },
    escolhida,
  };
}

/** O cronograma colado (uma parcela por linha). A leitura do texto e as recusas do domínio chegam com o motivo. */
export async function informarParcelasPelaTela(input: { readonly dividaId: string; readonly texto: string }): Promise<string> {
  const parcelas = lerCronogramaColado(input.texto);
  const r = await comEscritaAutenticada("CADASTRAR_DIVIDA", (criadoPor) =>
    informarParcelasDaDivida(cliente(), { dividaId: input.dividaId, parcelas: [...parcelas], criadoPor })
  );
  return `${String(r.informadas)} parcela(s) informada(s).`;
}

/** A correção de uma parcela (append-only: a corrigida sai do cronograma, a nova entra com o motivo). */
export async function substituirParcelaPelaTela(input: {
  readonly parcelaId: string;
  readonly linha: string;
  readonly motivo: string;
}): Promise<string> {
  // A mesma régua do cronograma colado, numa linha: "vencimento; principal; encargos". O número é o da parcela.
  const [p] = lerCronogramaColado(`1;${input.linha}`);
  await comEscritaAutenticada("CADASTRAR_DIVIDA", (criadoPor) =>
    substituirParcelaDaDivida(cliente(), {
      parcelaId: input.parcelaId, vencimento: p!.vencimento, valorPrincipal: p!.valorPrincipal, valorEncargos: p!.valorEncargos, motivo: input.motivo, criadoPor,
    })
  );
  return "Parcela corrigida. A versão anterior saiu do cronograma e fica no histórico.";
}
