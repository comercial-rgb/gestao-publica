import { diaCivil, fimDoDiaCivil } from "../../packages/datas/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { valorVigente } from "../m02-planejamento/proposta-orcamentaria.js";

/**
 * V39-R2 (R2-024, V39-020) — O EFEITO DAS EMENDAS SOBRE O PROJETO ENVIADO.
 *
 * A base é a VERSÃO GUARDADA do projeto do Executivo (a última encaminhada ou modificativa ligada à proposta, R2-023):
 * para cada linha citada em emenda, o valor no projeto, o que as emendas aprovadas DEPOIS da base acrescentaram ou
 * reduziram, o que foi rejeitado, o que ainda aguarda sanção, o esperado (projeto + aprovadas), o valor vigente da linha
 * hoje e a diferença que veio de outro ajuste (fora das emendas). Só leitura; nada se recalcula na versão nem na proposta.
 *
 * O MOMENTO DA BASE: a cópia de proposta ainda não efetivada leva os ajustes até o fim do dia do encaminhamento
 * (`projeto-da-proposta.ts`); a de proposta já efetivada leva as fichas como estavam ao guardar. A emenda aprovada cujo
 * ajuste é anterior à base JÁ ESTÁ no valor do projeto: aparece à parte e não soma de novo no esperado.
 *
 * SEM LIGAÇÃO NÃO HÁ CONTA: se a versão tem dotações sem a linha da proposta (correspondência não única), a linha citada
 * em emenda que não aparece ligada pode ter estado no projeto; o comparativo diz isso e não calcula esperado nem
 * diferença. SEM VERSÃO GUARDADA, NÃO HÁ COMPARATIVO: reconstruir o projeto a partir da proposta de hoje seria apresentar
 * como enviado um documento que não existe.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface LinhaDoComparativo {
  readonly linhaId: string;
  readonly rotulo: string;
  /** NO_PROJETO: ligada à cópia; FORA_DO_PROJETO: a versão não tem dotação sem ligação, logo a linha entrou depois;
   *  SEM_LIGACAO: a versão tem dotações sem ligação e esta linha pode ser uma delas. */
  readonly situacao: "NO_PROJETO" | "FORA_DO_PROJETO" | "SEM_LIGACAO";
  /** Nulo: fora do projeto ou sem ligação. */
  readonly projeto: string | null;
  /** Aprovadas antes da base: já estão no valor do projeto. */
  readonly jaNoProjeto: string;
  readonly aprovadas: string;
  readonly rejeitadas: string;
  readonly pendentes: string;
  /** Nulo quando sem ligação. */
  readonly esperado: string | null;
  readonly vigente: string;
  readonly outrosAjustes: string | null;
}

export interface ComparativoDasEmendas {
  readonly versao: { readonly numero: number; readonly tipo: string; readonly dataDoEncaminhamento: Date; readonly documento: string; readonly dotacoesSemLigacao: number } | null;
  readonly motivoSemVersao: string | null;
  readonly linhas: readonly LinhaDoComparativo[];
  readonly totais: { readonly projeto: string; readonly aprovadas: string; readonly rejeitadas: string; readonly pendentes: string; readonly vigente: string } | null;
}

export async function comparativoDasEmendas(prisma: Tx, propostaId: string): Promise<ComparativoDasEmendas> {
  const versao = await prisma.versaoDoProjetoDaLoa.findFirst({
    where: { propostaOrcamentariaId: propostaId, tipo: { in: ["ENCAMINHADO", "MENSAGEM_MODIFICATIVA"] } },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, tipo: true, dataDoEncaminhamento: true, documento: true, criadoEm: true, proposta: { select: { efetivacao: { select: { criadoEm: true } } } } },
  });
  if (versao === null) {
    return { versao: null, motivoSemVersao: "Nenhuma versão do projeto foi guardada com esta proposta: não há base para comparar, e o projeto enviado não se reconstrói a partir da proposta de hoje.", linhas: [], totais: null };
  }
  const efetivadaAntes = versao.proposta?.efetivacao !== null && versao.proposta?.efetivacao !== undefined && versao.proposta.efetivacao.criadoEm.getTime() <= versao.criadoEm.getTime();
  const base = efetivadaAntes ? versao.criadoEm : fimDoDiaCivil(diaCivil(versao.dataDoEncaminhamento));
  const dotacoesSemLigacao = await prisma.dotacaoDoProjetoDaLoa.count({ where: { versaoId: versao.id, linhaDaPropostaId: null } });

  const itens = await prisma.itemDaEmenda.findMany({
    where: { emenda: { propostaOrcamentariaId: propostaId } },
    select: { linhaDeDespesaId: true, valor: true, sancionados: { select: { ajuste: { select: { criadoEm: true } } } }, emenda: { select: { sancao: { select: { id: true } } } } },
  });
  const linhaIds = [...new Set(itens.map((i) => i.linhaDeDespesaId))];
  const [linhas, noProjeto] = await Promise.all([
    prisma.linhaDeDespesaDaProposta.findMany({
      where: { id: { in: linhaIds } },
      select: {
        id: true, valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } },
        fichaDeOrigem: { select: { numero: true } },
        programa: { select: { codigo: true } }, acao: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } },
      },
    }),
    prisma.dotacaoDoProjetoDaLoa.findMany({ where: { versaoId: versao.id, linhaDaPropostaId: { in: linhaIds } }, select: { linhaDaPropostaId: true, valor: true } }),
  ]);
  const soma = (xs: readonly { toFixed(n: number): string }[]): Money => xs.reduce<Money>((t, x) => toMoney(t.plus(x.toFixed(2))), toMoney(0));
  const out: LinhaDoComparativo[] = linhas.map((l) => {
    const daLinha = itens.filter((i) => i.linhaDeDespesaId === l.id);
    const aprovadosAntes = daLinha.filter((i) => i.sancionados.some((s) => s.ajuste.criadoEm.getTime() <= base.getTime()));
    const aprovadosDepois = daLinha.filter((i) => i.sancionados.length > 0 && !aprovadosAntes.includes(i));
    const jaNoProjeto = soma(aprovadosAntes.map((i) => i.valor));
    const aprovadas = soma(aprovadosDepois.map((i) => i.valor));
    const rejeitadas = soma(daLinha.filter((i) => i.emenda.sancao !== null && i.sancionados.length === 0).map((i) => i.valor));
    const pendentes = soma(daLinha.filter((i) => i.emenda.sancao === null).map((i) => i.valor));
    const doProjeto = noProjeto.filter((d) => d.linhaDaPropostaId === l.id);
    const situacao = doProjeto.length > 0 ? "NO_PROJETO" : dotacoesSemLigacao > 0 ? "SEM_LIGACAO" : "FORA_DO_PROJETO";
    const projeto = doProjeto.length === 0 ? null : soma(doProjeto.map((d) => d.valor));
    const vigente = valorVigente(toMoney(l.valorProjetado.toFixed(2)), l.ajustes.map((a) => ({ id: a.id, criadoEm: a.criadoEm, valor: toMoney(a.valor.toFixed(2)) })));
    const esperado = situacao === "SEM_LIGACAO" ? null : toMoney((projeto ?? toMoney(0)).plus(aprovadas));
    return {
      linhaId: l.id,
      rotulo: l.fichaDeOrigem !== null ? `ficha ${String(l.fichaDeOrigem.numero)}` : `linha nova ${l.programa?.codigo ?? ""}.${l.acao?.codigo ?? ""} ${l.naturezaDespesa?.codigoCompleto ?? ""}`.trim(),
      situacao,
      projeto: projeto?.toFixed(2) ?? null,
      jaNoProjeto: jaNoProjeto.toFixed(2),
      aprovadas: aprovadas.toFixed(2),
      rejeitadas: rejeitadas.toFixed(2),
      pendentes: pendentes.toFixed(2),
      esperado: esperado?.toFixed(2) ?? null,
      vigente: vigente.toFixed(2),
      outrosAjustes: esperado === null ? null : toMoney(vigente.minus(esperado)).toFixed(2),
    };
  });
  out.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  const tot = (k: "aprovadas" | "rejeitadas" | "pendentes" | "vigente"): string => soma(out.map((x) => toMoney(x[k]))).toFixed(2);
  return {
    versao: { numero: versao.numero, tipo: versao.tipo, dataDoEncaminhamento: versao.dataDoEncaminhamento, documento: versao.documento, dotacoesSemLigacao },
    motivoSemVersao: null,
    linhas: out,
    totais: { projeto: soma(out.filter((x) => x.projeto !== null).map((x) => toMoney(x.projeto!))).toFixed(2), aprovadas: tot("aprovadas"), rejeitadas: tot("rejeitadas"), pendentes: tot("pendentes"), vigente: tot("vigente") },
  };
}
