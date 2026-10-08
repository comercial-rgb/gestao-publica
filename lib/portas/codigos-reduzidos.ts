import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { codigosQueCasam, gerarCodigosReduzidosDoPlano, listarCodigosReduzidos, type CodigoReduzidoNaLista } from "../../modules/m02b-plurianual/codigo-reduzido";

/**
 * V36 — OS CÓDIGOS REDUZIDOS DA DESPESA DO PPA na tela (TR 5.9.1.8). A regra é do M02b
 * (`modules/m02b-plurianual/codigo-reduzido.ts`); aqui os planos, a busca e a sessão. Leitura: CONSULTAR_PLANEJAMENTO.
 */

export type { CodigoReduzidoNaLista };

export interface TelaDosCodigosReduzidos {
  readonly planos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly planoId: string | null;
  readonly codigos: readonly CodigoReduzidoNaLista[];
  /** Quantos códigos o plano tem, antes da busca. */
  readonly total: number;
  /** Ações classificadas sem código: o gerador atribui. */
  readonly acoesParaGerar: number;
  /** Ações sem unidade, função ou subfunção: o gerador não atribui; a classificação se completa no PPA. */
  readonly acoesSemClassificacao: number;
}

export async function lerCodigosReduzidos(planoPedido: string, busca: string): Promise<TelaDosCodigosReduzidos> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const planos = await prisma.planoPlurianual.findMany({ orderBy: { anoInicio: "desc" }, select: { id: true, anoInicio: true, anoFim: true, leiRef: true } });
  const planoId = planos.find((p) => p.id === planoPedido)?.id ?? planos[0]?.id ?? null;
  const todos = planoId === null ? [] : await listarCodigosReduzidos(prisma, planoId);
  let acoesParaGerar = 0;
  let acoesSemClassificacao = 0;
  if (planoId !== null) {
    const [acoes, existentes] = await Promise.all([
      prisma.acaoPpa.findMany({ where: { programaPpa: { planoId } }, select: { acaoId: true, unidadeExecutoraId: true, funcaoId: true, subfuncaoId: true, programaPpa: { select: { programaId: true } } } }),
      prisma.codigoReduzidoDaDespesaPpa.findMany({ where: { planoId }, select: { unidadeExecutoraId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true } }),
    ]);
    const chave = (u: string, f: string, s: string, p: string, a: string): string => [u, f, s, p, a].join("|");
    const tem = new Set(existentes.map((e) => chave(e.unidadeExecutoraId, e.funcaoId, e.subfuncaoId, e.programaId, e.acaoId)));
    for (const a of acoes) {
      if (a.unidadeExecutoraId === null || a.funcaoId === null || a.subfuncaoId === null) acoesSemClassificacao += 1;
      else if (!tem.has(chave(a.unidadeExecutoraId, a.funcaoId, a.subfuncaoId, a.programaPpa.programaId, a.acaoId))) acoesParaGerar += 1;
    }
  }
  return {
    planos: planos.map((p) => ({ id: p.id, rotulo: `PPA ${String(p.anoInicio)}–${String(p.anoFim)} (${p.leiRef})` })),
    planoId,
    codigos: codigosQueCasam(todos, busca),
    total: todos.length,
    acoesParaGerar,
    acoesSemClassificacao,
  };
}

export async function gerarCodigosReduzidosPelaTela(planoId: string): Promise<{ readonly atribuidos: number; readonly jaTinham: number; readonly semClassificacao: readonly string[] }> {
  return comEscritaAutenticada("CADASTRAR_PROGRAMA_PPA", (criadoPor) => gerarCodigosReduzidosDoPlano(cliente(), { planoId, criadoPor }));
}
