import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { listarNaturezasDeclaradas } from "../m01-core-contabil/natureza-da-fonte.js";
import { dotacaoFixadaDetalhada, previsaoPorNaturezaFonte } from "../m02-planejamento/consultas.js";
import { montarLoa, type DadosDaLoa, type LoaMontada, type VinculoDoRecurso } from "./anexos/loa.js";

/**
 * O LEITOR DA LOA CONSOLIDADA (M02b) — leitura pura; a montagem é `anexos/loa.ts`.
 *
 * ⚠️ DUAS LEITURAS DO MESMO FATO, DE PROPÓSITO. As fichas e as receitas previstas são lidas aqui
 * com a classificação completa (o que os anexos agrupam); os totais de REFERÊNCIA vêm dos leitores
 * que a consistência da LOA já usa (`dotacaoFixadaDetalhada`, `previsaoPorNaturezaFonte`, do M02).
 * A conferência dos anexos compara uma coisa com a outra — se as duas somassem pela mesma função,
 * ela passaria com qualquer erro consistente.
 *
 * ⚠️ DO ENTE, SEM UNIDADE: a receita prevista não tem unidade orçamentária, e a LOA é uma lei só.
 */
type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function lerDadosDaLoa(prisma: Leitor, p: { readonly exercicio: number }): Promise<DadosDaLoa> {
  const [fichas, receitas, declaradas, dotacaoRef, previsaoRef] = await Promise.all([
    prisma.fichaOrcamentaria.findMany({
      where: { exercicio: p.exercicio },
      orderBy: { numero: "asc" },
      select: {
        numero: true,
        valorDotado: true,
        orgao: { select: { codigo: true, nome: true } },
        unidadeOrc: { select: { codigo: true, descricao: true } },
        funcao: { select: { codigo: true, nome: true } },
        subfuncao: { select: { codigo: true, nome: true } },
        programa: { select: { codigo: true, descricao: true } },
        acao: { select: { codigo: true, descricao: true, tipo: true } },
        naturezaDespesa: { select: { codCategoria: true, codNatureza: true, codigoCompleto: true, descricao: true } },
        fonte: { select: { codigo: true } },
      },
    }),
    prisma.receitaPrevista.findMany({
      where: { exercicio: p.exercicio },
      select: {
        tipoReceita: true,
        valorPrevisto: true,
        naturezaReceita: { select: { codigo: true, descricao: true } },
        fonte: { select: { codigo: true } },
      },
    }),
    listarNaturezasDeclaradas(prisma),
    dotacaoFixadaDetalhada(prisma, { exercicio: p.exercicio }),
    previsaoPorNaturezaFonte(prisma, { exercicio: p.exercicio }),
  ]);

  const soma = (xs: readonly Money[]): Money => xs.reduce((a, b) => toMoney(a.plus(b)), toMoney("0.00"));
  const vinculoDaFonte = new Map<string, VinculoDoRecurso>(declaradas.map((d) => [d.fonteCodigo, d.natureza]));

  return {
    exercicio: p.exercicio,
    fichas: fichas.map((f) => ({
      numero: f.numero,
      orgao: { codigo: f.orgao.codigo, nome: f.orgao.nome },
      unidade: { codigo: f.unidadeOrc.codigo, nome: f.unidadeOrc.descricao },
      funcao: { codigo: f.funcao.codigo, nome: f.funcao.nome },
      subfuncao: { codigo: f.subfuncao.codigo, nome: f.subfuncao.nome },
      programa: { codigo: f.programa.codigo, nome: f.programa.descricao },
      acao: { codigo: f.acao.codigo, nome: f.acao.descricao, tipo: f.acao.tipo },
      natureza: {
        codCategoria: f.naturezaDespesa.codCategoria,
        codGrupo: f.naturezaDespesa.codNatureza,
        codigoCompleto: f.naturezaDespesa.codigoCompleto,
        descricao: f.naturezaDespesa.descricao,
      },
      fonteCodigo: f.fonte.codigo,
      valorDotado: toMoney(f.valorDotado.toFixed(2)),
    })),
    receitas: receitas.map((r) => ({
      naturezaCodigo: r.naturezaReceita.codigo,
      naturezaDescricao: r.naturezaReceita.descricao,
      fonteCodigo: r.fonte.codigo,
      tipoReceita: r.tipoReceita,
      valorPrevisto: toMoney(r.valorPrevisto.toFixed(2)),
    })),
    vinculoDaFonte,
    referencia: {
      receitaPrevista: soma(previsaoRef.map((r) => r.previsto)),
      despesaFixada: soma(dotacaoRef.map((f) => f.valorDotado)),
    },
  };
}

/** A LOA do exercício, montada e conferida. Lança `ConferenciaDaLoaError` se algum anexo não fechar. */
export async function loaDoExercicio(prisma: Leitor, p: { readonly exercicio: number }): Promise<LoaMontada> {
  return montarLoa(await lerDadosDaLoa(prisma, p));
}
