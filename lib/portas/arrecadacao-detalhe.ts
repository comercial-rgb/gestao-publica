import { anoCivil, diaCivil } from "../../packages/datas/index";
import { cliente } from "./cliente";
import { instanteDoDiaDoBanco } from "../../modules/m09-tesouraria/dia-do-banco";
import { exigirLeituraDoEnte } from "./leitura";

/**
 * V33 — UMA ARRECADAÇÃO E A CADEIA DELA: classificação (natureza, fonte, CO) → entidade titular → conta bancária →
 * conciliação com o extrato → lançamento no razão → demonstrativo. Leitura; cada elo aponta para onde ele mora. A
 * ausência de um elo é dita como ausência ("sem entidade atribuída", "não conciliada"), nunca preenchida.
 */

export interface ArrecadacaoDetalhada {
  readonly id: string;
  readonly numero: string;
  readonly exercicio: number;
  readonly data: Date;
  readonly valor: string;
  readonly tipo: string;
  readonly natureza: { readonly codigo: string; readonly descricao: string };
  readonly fonte: string;
  readonly co: string | null;
  /** A distribuição por fonte (receita de mais de uma fonte), quando houver. */
  readonly distribuicao: readonly { readonly fonte: string; readonly valor: string; readonly previstaNaLoa: boolean }[];
  readonly entidade: { readonly codigo: string; readonly nome: string } | null;
  readonly conta: { readonly codigo: string; readonly descricao: string; readonly contaContabil: string | null } | null;
  readonly lancamentoId: string;
  readonly anulacoes: readonly { readonly id: string; readonly numero: string; readonly data: Date; readonly valor: string; readonly lancamentoId: string }[];
  readonly conciliacao: readonly { readonly dataExtrato: Date; readonly valor: string; readonly documento: string | null; readonly memo: string; readonly conta: string }[];
  /** O dia do fato, para o razão e o balanço abrirem no período certo. */
  readonly dia: string;
  readonly criadoPor: string;
}

export async function lerArrecadacao(id: string): Promise<ArrecadacaoDetalhada | null> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const db = cliente();
  const r = await db.receitaArrecadada.findUnique({
    where: { id },
    select: {
      id: true,
      numeroReceita: true,
      exercicio: true,
      dataArrecadacao: true,
      valor: true,
      tipo: true,
      estornoDeId: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
      fonte: { select: { codigo: true } },
      co: { select: { codigo: true } },
      distribuicao: { select: { valor: true, previstaNaLoa: true, fonte: { select: { codigo: true } } } },
      entidadeTitular: { select: { codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } } } },
      contaBancaria: { select: { codigo: true, descricao: true, contaContabil: { select: { codigo: true } } } },
      lancamentoId: true,
      estornos: { select: { id: true, numeroReceita: true, dataArrecadacao: true, valor: true, lancamentoId: true } },
      criadoPor: true,
    },
  });
  if (r === null) return null;
  // A anulação é um registro próprio que aponta a original: quem chega pela anulação vê a cadeia da original.
  if (r.estornoDeId !== null) return lerArrecadacao(r.estornoDeId);
  const vinculos = await db.vinculoConciliacao.findMany({
    where: { tipoInterno: "ARRECADACAO", internoId: r.id, estornoDeId: null, estornos: { none: {} } },
    select: { valor: true, lancamentoExtrato: { select: { dataPostagem: true, documento: true, memo: true, contaBancaria: { select: { codigo: true } } } } },
  });
  return {
    id: r.id,
    numero: r.numeroReceita,
    exercicio: r.exercicio,
    data: r.dataArrecadacao,
    valor: r.valor.toFixed(2),
    tipo: r.tipo,
    natureza: r.naturezaReceita,
    fonte: r.fonte.codigo,
    co: r.co?.codigo ?? null,
    distribuicao: r.distribuicao.map((d) => ({ fonte: d.fonte.codigo, valor: d.valor.toFixed(2), previstaNaLoa: d.previstaNaLoa })),
    entidade: r.entidadeTitular === null ? null : { codigo: r.entidadeTitular.codigo, nome: r.entidadeTitular.versoes[0]?.nome ?? "" },
    conta: r.contaBancaria === null ? null : { codigo: r.contaBancaria.codigo, descricao: r.contaBancaria.descricao, contaContabil: r.contaBancaria.contaContabil?.codigo ?? null },
    lancamentoId: r.lancamentoId,
    anulacoes: r.estornos.map((e) => ({ id: e.id, numero: e.numeroReceita, data: e.dataArrecadacao, valor: e.valor.toFixed(2), lancamentoId: e.lancamentoId })),
    conciliacao: vinculos.map((v) => ({
      dataExtrato: instanteDoDiaDoBanco(v.lancamentoExtrato.dataPostagem),
      valor: v.valor.toFixed(2),
      documento: v.lancamentoExtrato.documento,
      memo: v.lancamentoExtrato.memo,
      conta: v.lancamentoExtrato.contaBancaria.codigo,
    })),
    dia: diaCivil(r.dataArrecadacao),
    criadoPor: r.criadoPor,
  };
}

/** O ano civil do fato — o exercício em que o razão e o balanço o mostram. */
export const anoDoFato = (a: ArrecadacaoDetalhada): number => anoCivil(a.data);
