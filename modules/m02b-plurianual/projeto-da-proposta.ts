import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { TipoReceitaPrevista } from "../m02-planejamento/dominio.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { valorVigente } from "../m02-planejamento/proposta-orcamentaria.js";

/**
 * V39-R2 (R2-023, V39-019) — DE ONDE VÊM OS VALORES DA VERSÃO DO PROJETO DA LOA, E A QUE LINHA DA PROPOSTA CADA UM APONTA.
 *
 * Três casos, e nenhum reconstrói documento:
 *   · exercício SEM proposta registrada: as fichas e a receita prevista, como sempre (sem ligação);
 *   · proposta AINDA NÃO EFETIVADA: as próprias linhas da proposta, pelo valor vigente (projetado + ajustes, a mesma
 *     derivação da tela e da efetivação), cada linha da cópia ligada à linha de onde veio — é o caso do projeto que vai
 *     à Câmara antes de virar orçamento;
 *   · proposta JÁ EFETIVADA: as fichas e a receita prevista (o que a efetivação criou, como sempre), cada uma ligada à
 *     linha da proposta pela classificação, quando a correspondência é ÚNICA; a que não tem par único fica sem ligação
 *     e é contada (a tela diz quantas).
 * A linha de valor zero não vira ficha na efetivação e não entra na cópia; valor negativo é recusado, como na efetivação.
 *
 * O CORTE: antes da efetivação, o valor de cada linha é o vigente no fim do dia do encaminhamento (os ajustes gravados
 * até ali). Guardar depois a versão de uma data passada não leva para ela a emenda sancionada depois do envio.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const SEL_UNIDADE = { id: true, codigo: true, descricao: true, declaracoes: { select: { naturezaJuridica: true, nomeSecretario: true, cpfSecretario: true, atoDeNomeacao: true, vigenteDesde: true, criadoEm: true } } } as const;
const SEL_PROGRAMA = { id: true, codigo: true, declaracoes: { select: { descricao: true, objetivo: true, tipoObjetivoMilenio: true, vigenteDesde: true, criadoEm: true } } } as const;
const SEL_ACAO = { id: true, codigo: true, tipo: true, declaracoes: { select: { descricao: true, descMeta: true, unidadeMedida: true, vigenteDesde: true, criadoEm: true } } } as const;
const SEL_NATUREZA = { codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true } as const;

/** O select das fichas na cópia (o mesmo de sempre), com os ids da classificação para a ligação. */
export const SEL_FICHA_DO_PROJETO = {
  exercicioFonte: true,
  valorDotado: true,
  unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true,
  unidadeOrc: { select: SEL_UNIDADE },
  funcao: { select: { codigo: true } },
  subfuncao: { select: { codigo: true } },
  programa: { select: SEL_PROGRAMA },
  acao: { select: SEL_ACAO },
  naturezaDespesa: { select: SEL_NATUREZA },
  fonte: { select: { codigo: true } },
} as const;

type ClassificacaoDaDespesa = { readonly unidadeOrcId: string; readonly funcaoId: string; readonly subfuncaoId: string; readonly programaId: string; readonly acaoId: string; readonly naturezaDespesaId: string; readonly fonteId: string; readonly exercicioFonte: number };
type ClassificacaoDaReceita = { readonly naturezaReceitaId: string; readonly fonteId: string; readonly exercicioFonte: number; readonly tipoReceita: string };
const chaveD = (c: ClassificacaoDaDespesa): string => [c.unidadeOrcId, c.funcaoId, c.subfuncaoId, c.programaId, c.acaoId, c.naturezaDespesaId, c.fonteId, String(c.exercicioFonte)].join("|");
const chaveR = (c: ClassificacaoDaReceita): string => [c.naturezaReceitaId, c.fonteId, String(c.exercicioFonte), c.tipoReceita].join("|");

async function lerFichas(tx: Tx, exercicio: number) {
  return tx.fichaOrcamentaria.findMany({ where: { exercicio }, orderBy: [{ unidadeOrcId: "asc" }, { numero: "asc" }], select: SEL_FICHA_DO_PROJETO });
}
/** Uma linha de despesa da cópia: o formato da ficha (a captura não distingue a origem), mais a linha da proposta. */
export type DespesaDoProjeto = Omit<Awaited<ReturnType<typeof lerFichas>>[number], "valorDotado"> & { readonly valorDotado: string; readonly linhaDaPropostaId: string | null };

export interface ReceitaDoProjeto {
  readonly exercicioFonte: number;
  readonly tipoReceita: TipoReceitaPrevista;
  readonly valorPrevisto: string;
  readonly naturezaReceita: { readonly codigo: string };
  readonly fonte: { readonly codigo: string };
  readonly detalhe: { readonly tipoDeducaoSagres: string | null } | null;
  readonly linhaDaPropostaId: string | null;
}

const vigente = (l: { readonly valorProjetado: { toFixed(n: number): string }; readonly ajustes: readonly { readonly id: string; readonly valor: { toFixed(n: number): string }; readonly criadoEm: Date }[] }, corte?: Date): Money =>
  valorVigente(toMoney(l.valorProjetado.toFixed(2)), l.ajustes.filter((a) => corte === undefined || a.criadoEm.getTime() <= corte.getTime()).map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) })));

export async function dadosDoProjeto(
  tx: Tx,
  exercicio: number,
  proposta: { readonly id: string; readonly efetivada: boolean } | null,
  corte: Date
): Promise<{ readonly despesas: readonly DespesaDoProjeto[]; readonly receitas: readonly ReceitaDoProjeto[]; readonly semLigacao: number }> {
  const linhasD = proposta === null ? [] : await tx.linhaDeDespesaDaProposta.findMany({
    where: { propostaOrcamentariaId: proposta.id },
    select: {
      id: true, valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } },
      fichaDeOrigem: { select: { unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true, exercicioFonte: true } },
      unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true, exercicioFonte: true,
    },
  });
  const linhasR = proposta === null ? [] : await tx.linhaDeReceitaDaProposta.findMany({
    where: { propostaOrcamentariaId: proposta.id },
    select: {
      id: true, valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } },
      receitaDeOrigem: { select: { naturezaReceitaId: true, fonteId: true, exercicioFonte: true, tipoReceita: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true } } } },
      naturezaReceitaId: true, fonteId: true, exercicioFonte: true, tipoReceita: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } },
    },
  });
  const classD = (l: (typeof linhasD)[number]): ClassificacaoDaDespesa => {
    const o = l.fichaDeOrigem;
    if (o !== null) return o;
    if (l.unidadeOrcId === null || l.funcaoId === null || l.subfuncaoId === null || l.programaId === null || l.acaoId === null || l.naturezaDespesaId === null || l.fonteId === null || l.exercicioFonte === null) {
      throw new Error(`A linha de despesa ${l.id} da proposta não tem origem nem classificação. Nada foi gravado.`);
    }
    return { unidadeOrcId: l.unidadeOrcId, funcaoId: l.funcaoId, subfuncaoId: l.subfuncaoId, programaId: l.programaId, acaoId: l.acaoId, naturezaDespesaId: l.naturezaDespesaId, fonteId: l.fonteId, exercicioFonte: l.exercicioFonte };
  };
  const classR = (l: (typeof linhasR)[number]): ClassificacaoDaReceita & { readonly codNatureza: string; readonly codFonte: string; readonly tipoDeducao: string | null } => {
    const o = l.receitaDeOrigem;
    if (o !== null) return { naturezaReceitaId: o.naturezaReceitaId, fonteId: o.fonteId, exercicioFonte: o.exercicioFonte, tipoReceita: o.tipoReceita, codNatureza: o.naturezaReceita.codigo, codFonte: o.fonte.codigo, tipoDeducao: o.detalhe?.tipoDeducaoSagres ?? null };
    if (l.naturezaReceitaId === null || l.fonteId === null || l.exercicioFonte === null || l.tipoReceita === null || l.naturezaReceita === null || l.fonte === null) {
      throw new Error(`A linha de receita ${l.id} da proposta não tem origem nem classificação. Nada foi gravado.`);
    }
    return { naturezaReceitaId: l.naturezaReceitaId, fonteId: l.fonteId, exercicioFonte: l.exercicioFonte, tipoReceita: l.tipoReceita, codNatureza: l.naturezaReceita.codigo, codFonte: l.fonte.codigo, tipoDeducao: null };
  };
  // Antes da efetivação, o valor no corte; depois, o vigente (o que a efetivação levou às fichas, só para a ligação).
  const noCorte = proposta !== null && !proposta.efetivada ? corte : undefined;
  const vivasD = linhasD.map((l) => ({ l, c: classD(l), v: vigente(l, noCorte) }));
  const vivasR = linhasR.map((l) => ({ l, c: classR(l), v: vigente(l, noCorte) }));
  const negativa = [...vivasD, ...vivasR].find((x) => x.v.isNegative());
  if (negativa !== undefined) throw new Error(`A linha ${negativa.l.id} da proposta está com valor negativo: ajuste-a antes de guardar o projeto. Nada foi gravado.`);

  // ── proposta ainda não efetivada: as linhas são o projeto ──
  if (proposta !== null && !proposta.efetivada) {
    const d = vivasD.filter((x) => !x.v.isZero());
    const ids = (k: keyof ClassificacaoDaDespesa): string[] => [...new Set(d.map((x) => String(x.c[k])))];
    const [unidades, funcoes, subfuncoes, programas, acoes, naturezas, fontes] = await Promise.all([
      tx.unidadeOrcamentaria.findMany({ where: { id: { in: ids("unidadeOrcId") } }, select: SEL_UNIDADE }),
      tx.funcao.findMany({ where: { id: { in: ids("funcaoId") } }, select: { id: true, codigo: true } }),
      tx.subfuncao.findMany({ where: { id: { in: ids("subfuncaoId") } }, select: { id: true, codigo: true } }),
      tx.programa.findMany({ where: { id: { in: ids("programaId") } }, select: SEL_PROGRAMA }),
      tx.acao.findMany({ where: { id: { in: ids("acaoId") } }, select: SEL_ACAO }),
      tx.naturezaDespesa.findMany({ where: { id: { in: ids("naturezaDespesaId") } }, select: { id: true, ...SEL_NATUREZA } }),
      tx.fonteRecurso.findMany({ where: { id: { in: ids("fonteId") } }, select: { id: true, codigo: true } }),
    ]);
    const achar = <T extends { id: string }>(xs: readonly T[], id: string): T => {
      const x = xs.find((y) => y.id === id);
      if (x === undefined) throw new Error(`A classificação ${id} da proposta não está no cadastro. Nada foi gravado.`);
      return x;
    };
    const despesas: DespesaDoProjeto[] = d.map(({ l, c, v }) => ({
      ...c,
      valorDotado: v.toFixed(2),
      unidadeOrc: achar(unidades, c.unidadeOrcId),
      funcao: achar(funcoes, c.funcaoId),
      subfuncao: achar(subfuncoes, c.subfuncaoId),
      programa: achar(programas, c.programaId),
      acao: achar(acoes, c.acaoId),
      naturezaDespesa: achar(naturezas, c.naturezaDespesaId),
      fonte: achar(fontes, c.fonteId),
      linhaDaPropostaId: l.id,
    }));
    const receitas: ReceitaDoProjeto[] = vivasR.filter((x) => !x.v.isZero()).map(({ l, c, v }) => ({
      exercicioFonte: c.exercicioFonte, tipoReceita: c.tipoReceita as TipoReceitaPrevista, valorPrevisto: v.toFixed(2),
      naturezaReceita: { codigo: c.codNatureza }, fonte: { codigo: c.codFonte }, detalhe: { tipoDeducaoSagres: c.tipoDeducao }, linhaDaPropostaId: l.id,
    }));
    return { despesas, receitas, semLigacao: 0 };
  }

  // ── sem proposta, ou proposta efetivada: as fichas e a receita prevista (e a ligação por classificação) ──
  const fichas = await lerFichas(tx, exercicio);
  const previstas = await tx.receitaPrevista.findMany({
    where: { exercicio },
    select: { naturezaReceitaId: true, fonteId: true, exercicioFonte: true, tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true } } },
  });
  const porChaveD = new Map<string, string[]>();
  for (const x of vivasD) if (!x.v.isZero()) porChaveD.set(chaveD(x.c), [...(porChaveD.get(chaveD(x.c)) ?? []), x.l.id]);
  const porChaveR = new Map<string, string[]>();
  for (const x of vivasR) if (!x.v.isZero()) porChaveR.set(chaveR(x.c), [...(porChaveR.get(chaveR(x.c)) ?? []), x.l.id]);
  const fichasNaChave = new Map<string, number>();
  for (const f of fichas) fichasNaChave.set(chaveD(f), (fichasNaChave.get(chaveD(f)) ?? 0) + 1);
  const previstasNaChave = new Map<string, number>();
  for (const r of previstas) previstasNaChave.set(chaveR(r), (previstasNaChave.get(chaveR(r)) ?? 0) + 1);
  let semLigacao = 0;
  const unica = (ls: string[] | undefined, quantasDoOutroLado: number | undefined): string | null => {
    if (proposta === null) return null;
    if (ls?.length === 1 && quantasDoOutroLado === 1) return ls[0]!;
    semLigacao += 1;
    return null;
  };
  const despesas: DespesaDoProjeto[] = fichas.map((f) => ({ ...f, valorDotado: f.valorDotado.toFixed(2), linhaDaPropostaId: unica(porChaveD.get(chaveD(f)), fichasNaChave.get(chaveD(f))) }));
  const receitas: ReceitaDoProjeto[] = previstas.map((r) => ({
    exercicioFonte: r.exercicioFonte, tipoReceita: r.tipoReceita, valorPrevisto: r.valorPrevisto.toFixed(2), naturezaReceita: r.naturezaReceita, fonte: r.fonte,
    detalhe: r.detalhe, linhaDaPropostaId: unica(porChaveR.get(chaveR(r)), previstasNaChave.get(chaveR(r))),
  }));
  return { despesas, receitas, semLigacao };
}
