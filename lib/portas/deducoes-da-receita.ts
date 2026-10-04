import { diaCivil } from "../../packages/datas/index.js";
import { estornarDeducaoDaReceita, registrarDeducaoDaReceita } from "../../modules/m04-receita/deducao-da-receita.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V35 — A DEDUÇÃO DA RECEITA NA TELA (FUNDEB retido na origem). Lista do exercício com o estorno ao lado, e as
 * escolhas do formulário (naturezas arrecadadas no exercício, fontes, contas bancárias com conta contábil).
 */

export interface DeducaoNaTela {
  readonly id: string;
  readonly dia: string;
  readonly natureza: string;
  readonly naturezaDescricao: string;
  readonly fonte: string;
  readonly valor: string;
  readonly documento: string;
  readonly conta: string;
  readonly estorno: { readonly dia: string; readonly motivo: string | null } | null;
  readonly ehEstorno: boolean;
  readonly criadoPor: string;
}

export interface EscolhasDaDeducao {
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contas: readonly { readonly codigo: string; readonly descricao: string }[];
}

const dia = (d: Date): string => diaCivil(d);

export async function lerDeducoesDaReceita(exercicio: number): Promise<readonly DeducaoNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const ds = await cliente().deducaoDaReceitaRealizada.findMany({
    where: { exercicio },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true, data: true, valor: true, documento: true, estornoDeId: true, motivo: true, criadoPor: true,
      naturezaReceita: { select: { codigo: true, descricao: true } }, fonte: { select: { codigo: true } }, contaBancaria: { select: { codigo: true } },
      estorno: { select: { data: true, motivo: true } },
    },
  });
  return ds.map((d) => ({
    id: d.id, dia: dia(d.data), natureza: d.naturezaReceita.codigo, naturezaDescricao: d.naturezaReceita.descricao, fonte: d.fonte.codigo,
    valor: d.valor.toFixed(2), documento: d.documento, conta: d.contaBancaria.codigo,
    estorno: d.estorno === null ? null : { dia: dia(d.estorno.data), motivo: d.estorno.motivo }, ehEstorno: d.estornoDeId !== null, criadoPor: d.criadoPor,
  }));
}

export async function lerEscolhasDaDeducao(exercicio: number): Promise<EscolhasDaDeducao> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const [arrecadadas, fontes, contas] = await Promise.all([
    cliente().receitaArrecadada.findMany({ where: { exercicio }, distinct: ["naturezaReceitaId"], select: { naturezaReceita: { select: { codigo: true, descricao: true } } } }),
    cliente().fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
    cliente().contaBancaria.findMany({ where: { contaContabilId: { not: null } }, orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
  ]);
  return {
    naturezas: arrecadadas.map((a) => a.naturezaReceita).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    fontes,
    contas,
  };
}

export async function registrarDeducao(input: {
  readonly naturezaReceita: string;
  readonly fonte: string;
  readonly valor: string;
  readonly dia: string;
  readonly contaBancaria: string;
  readonly documento: string;
}): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_ARRECADACAO", (criadoPor) => registrarDeducaoDaReceita(cliente(), { ...input, criadoPor }));
  return `Dedução de ${input.valor} da receita ${input.naturezaReceita} (fonte ${input.fonte}) registrada em ${input.dia}: a receita realizada, o banco e a disponibilidade da fonte passam a mostrar o líquido.`;
}

export async function estornarDeducao(input: { readonly deducaoId: string; readonly dia: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("ANULAR_ARRECADACAO", (criadoPor) => estornarDeducaoDaReceita(cliente(), { ...input, criadoPor }));
  return `Dedução estornada em ${input.dia}. O lançamento original continua no razão, ao lado do estorno.`;
}
