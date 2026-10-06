import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { incorporadoDaLiquidacaoNaTx, liquidoDaLiquidacaoNaTx } from "./patrimonio.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — RELATÓRIO DE BENS INCORPORADOS E A INCORPORAR (TR 5.10.1.56).
 *
 * Duas partes, as duas do exercício da dotação:
 *   (A) as LIQUIDAÇÕES DE CAPITAL (grupos 4 e 5) com o liquidado, o já incorporado e o que falta incorporar, com o
 *       empenho de cada uma — a lista dos bens "a incorporar";
 *   (B) as INCORPORAÇÕES feitas a partir de liquidação (aquisições vivas), com o bem, a classe, a conta do ativo e a data.
 *
 * ⚠️ NENHUMA ARITMÉTICA NOVA: o liquidado e o incorporado de cada liquidação são `liquidoDaLiquidacaoNaTx` e
 * `incorporadoDaLiquidacaoNaTx`, as MESMAS funções que o teto de `adquirirBem` confere dentro da trava. O relatório que
 * dissesse "a incorporar 100" quando o guard aceita 80 mandaria o operador a uma recusa.
 *
 * Filtros: qualquer campo da dotação (órgão, unidade, função, subfunção, programa, ação, natureza, fonte), sem unidade é
 * o consolidado; a classe e a conta do ativo (pela classe prometida no empenho ou pela classe incorporada); e o período
 * de incorporação, que recorta a parte (B) — a parte (A) é a posição da liquidação, não do período.
 */

export interface FiltroDeIncorporacao {
  readonly exercicio: number;
  readonly orgaoId?: string | undefined;
  readonly unidadeOrcId?: string | undefined;
  readonly funcaoId?: string | undefined;
  readonly subfuncaoId?: string | undefined;
  readonly programaId?: string | undefined;
  readonly acaoId?: string | undefined;
  readonly naturezaDespesaId?: string | undefined;
  readonly fonteId?: string | undefined;
  readonly classeDeBensId?: string | undefined;
  readonly contaContabilId?: string | undefined;
  readonly de?: Date | undefined;
  readonly ate?: Date | undefined;
}

export type SituacaoDaIncorporacao = "INCORPORADA" | "INCORPORADA_EM_PARTE" | "A_INCORPORAR" | "SEM_SALDO";

export interface LiquidacaoDeCapital {
  readonly liquidacaoId: string;
  readonly liquidacaoNumero: string;
  readonly data: Date;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly classePrometida: string | null;
  readonly liquidado: Money;
  readonly incorporado: Money;
  readonly aIncorporar: Money;
  readonly situacao: SituacaoDaIncorporacao;
}

export interface IncorporacaoFeita {
  readonly movimentoId: string;
  readonly data: Date;
  readonly valor: Money;
  readonly bem: string | null;
  readonly classe: string;
  readonly conta: string;
  readonly liquidacaoNumero: string;
  readonly empenhoNumero: string;
}

export interface RelatorioDeIncorporacao {
  readonly liquidacoes: readonly LiquidacaoDeCapital[];
  readonly incorporacoes: readonly IncorporacaoFeita[];
  readonly totais: { readonly liquidado: Money; readonly incorporado: Money; readonly aIncorporar: Money; readonly incorporadoNoPeriodo: Money };
}

function situacao(liquidado: Money, incorporado: Money): SituacaoDaIncorporacao {
  if (liquidado.isZero()) return "SEM_SALDO";
  if (incorporado.isZero()) return "A_INCORPORAR";
  return incorporado.greaterThanOrEqualTo(liquidado) ? "INCORPORADA" : "INCORPORADA_EM_PARTE";
}

export async function relatorioDeIncorporacao(leitor: Tx, f: FiltroDeIncorporacao): Promise<RelatorioDeIncorporacao> {
  const ficha = {
    exercicio: f.exercicio,
    ...(f.orgaoId !== undefined ? { orgaoId: f.orgaoId } : {}),
    ...(f.unidadeOrcId !== undefined ? { unidadeOrcId: f.unidadeOrcId } : {}),
    ...(f.funcaoId !== undefined ? { funcaoId: f.funcaoId } : {}),
    ...(f.subfuncaoId !== undefined ? { subfuncaoId: f.subfuncaoId } : {}),
    ...(f.programaId !== undefined ? { programaId: f.programaId } : {}),
    ...(f.acaoId !== undefined ? { acaoId: f.acaoId } : {}),
    ...(f.naturezaDespesaId !== undefined ? { naturezaDespesaId: f.naturezaDespesaId } : {}),
    ...(f.fonteId !== undefined ? { fonteId: f.fonteId } : {}),
    naturezaDespesa: { codNatureza: { in: ["4", "5"] } },
  };
  const daClasse = (c: { readonly id: string; readonly contaContabilAtivoId: string } | null): boolean =>
    c !== null && (f.classeDeBensId === undefined || c.id === f.classeDeBensId) && (f.contaContabilId === undefined || c.contaContabilAtivoId === f.contaContabilId);
  const filtraClasse = f.classeDeBensId !== undefined || f.contaContabilId !== undefined;

  const originais = await leitor.liquidacao.findMany({
    where: { estornoDeId: null, anulacaoParcialDeId: null, empenho: { ficha } },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      empenho: {
        select: {
          id: true,
          numero: true,
          credorCpfCnpj: true,
          classeDeBens: { select: { id: true, codigo: true, contaContabilAtivoId: true } },
          ficha: { select: { numero: true, unidadeOrc: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } } } },
        },
      },
      movimentosPatrimoniais: { where: { tipo: "AQUISICAO", estornoDeId: null }, select: { classeDeBens: { select: { id: true, contaContabilAtivoId: true } } } },
    },
  });

  const liquidacoes: LiquidacaoDeCapital[] = [];
  for (const l of originais) {
    if (filtraClasse && !daClasse(l.empenho.classeDeBens) && !l.movimentosPatrimoniais.some((m) => daClasse(m.classeDeBens))) continue;
    const liquidado = await liquidoDaLiquidacaoNaTx(leitor, l.id);
    const incorporado = await incorporadoDaLiquidacaoNaTx(leitor, l.id);
    liquidacoes.push({
      liquidacaoId: l.id,
      liquidacaoNumero: l.numero,
      data: l.data,
      empenhoId: l.empenho.id,
      empenhoNumero: l.empenho.numero,
      credorCpfCnpj: l.empenho.credorCpfCnpj,
      fichaNumero: l.empenho.ficha.numero,
      unidadeCodigo: l.empenho.ficha.unidadeOrc.codigo,
      naturezaCodigo: l.empenho.ficha.naturezaDespesa.codigoCompleto,
      fonteCodigo: l.empenho.ficha.fonte.codigo,
      classePrometida: l.empenho.classeDeBens?.codigo ?? null,
      liquidado,
      incorporado,
      aIncorporar: toMoney(liquidado.minus(incorporado)),
      situacao: situacao(liquidado, incorporado),
    });
  }

  const movimentos = await leitor.movimentoPatrimonial.findMany({
    where: {
      tipo: "AQUISICAO",
      estornoDeId: null,
      estornos: { none: {} },
      liquidacao: { empenho: { ficha } },
      ...(f.classeDeBensId !== undefined ? { classeDeBensId: f.classeDeBensId } : {}),
      ...(f.contaContabilId !== undefined ? { classeDeBens: { contaContabilAtivoId: f.contaContabilId } } : {}),
      ...(f.de !== undefined || f.ate !== undefined
        ? { dataMovimento: { ...(f.de !== undefined ? { gte: f.de } : {}), ...(f.ate !== undefined ? { lte: f.ate } : {}) } }
        : {}),
    },
    orderBy: [{ dataMovimento: "asc" }, { id: "asc" }],
    select: {
      id: true,
      dataMovimento: true,
      valor: true,
      bem: { select: { numeroTombamento: true, descricao: true } },
      classeDeBens: { select: { codigo: true, descricao: true, contaContabilAtivo: { select: { codigo: true } } } },
      liquidacao: { select: { numero: true, empenho: { select: { numero: true } } } },
    },
  });
  const incorporacoes: IncorporacaoFeita[] = movimentos.map((m) => ({
    movimentoId: m.id,
    data: m.dataMovimento,
    valor: toMoney(m.valor.toFixed(2)),
    bem: m.bem === null ? null : `${m.bem.numeroTombamento} — ${m.bem.descricao}`,
    classe: `${m.classeDeBens.codigo} — ${m.classeDeBens.descricao}`,
    conta: m.classeDeBens.contaContabilAtivo.codigo,
    liquidacaoNumero: m.liquidacao?.numero ?? "",
    empenhoNumero: m.liquidacao?.empenho.numero ?? "",
  }));

  const zero = toMoney("0.00");
  const soma = (xs: readonly Money[]): Money => xs.reduce((a, x) => toMoney(a.plus(x)), zero);
  return {
    liquidacoes,
    incorporacoes,
    totais: {
      liquidado: soma(liquidacoes.map((l) => l.liquidado)),
      incorporado: soma(liquidacoes.map((l) => l.incorporado)),
      aIncorporar: soma(liquidacoes.map((l) => l.aIncorporar)),
      incorporadoNoPeriodo: soma(incorporacoes.map((i) => i.valor)),
    },
  };
}
