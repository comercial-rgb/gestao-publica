import { diaCivilBr } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACOES_DA_PROJECAO_FINANCEIRA, contratosNoAlcanceDaFiscalizacao } from "./acesso-da-fiscalizacao.js";
import { situacaoDaOrdem, type SituacaoDaOrdem } from "./execucao-do-contrato.js";

/**
 * V38 (AUD-122) — AS ORDENS DE SERVIÇO QUE A SESSÃO ALCANÇA, de todos os contratos, numa lista só.
 *
 * Antes, a ordem só se achava dentro do contrato. A lista não abre um acesso novo: alcança os MESMOS contratos que a
 * tela do contrato mostra (`alcanceNoContrato`): os de designação vigente, todos para o administrador da fiscalização, e
 * todos na visão financeira para quem tem uma das `ACOES_DA_PROJECAO_FINANCEIRA` (é o que lhe abre a execução de
 * qualquer contrato para liquidar). Quem não alcança nenhum recebe a lista vazia — nem contagem de outros.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function contratosNoAlcanceDasOrdens(tx: Tx, usuarioIdent: string, agora: Date = new Date()): Promise<{ readonly todos: boolean; readonly ids: readonly string[] }> {
  const fiscalizacao = await contratosNoAlcanceDaFiscalizacao(tx, usuarioIdent, agora);
  if (fiscalizacao.todos) return fiscalizacao;
  const financeira = await tx.usuario.findFirst({
    where: {
      identificador: usuarioIdent,
      ativo: true,
      vinculos: { some: { perfil: { permissoes: { some: { acao: { in: [...ACOES_DA_PROJECAO_FINANCEIRA] } } } } } },
    },
    select: { id: true },
  });
  return financeira !== null ? { todos: true, ids: [] } : fiscalizacao;
}

export interface OrdemNaLista {
  readonly id: string;
  readonly contratoId: string;
  readonly contrato: string;
  readonly contratado: string;
  readonly numero: number;
  readonly ano: number;
  readonly finalidade: string;
  readonly situacao: SituacaoDaOrdem;
  readonly previsto: string;
  readonly emitidaEm: string | null;
  readonly empenho: string | null;
}

/** V39-050 — a lista vai por páginas (antes: as 300 mais recentes, e as anteriores só pelo contrato). */
export const ORDENS_POR_PAGINA = 100;

export interface FiltroDasOrdens {
  /** Número ("12" ou "12/2026"), número do contrato, contratado ou finalidade; sem distinguir maiúsculas. */
  readonly busca?: string;
  readonly ano?: number;
  readonly situacao?: SituacaoDaOrdem;
  /** A partir de 1. */
  readonly pagina?: number;
}

/**
 * As ordens no alcance, da mais recente para a mais antiga, filtradas e paginadas NO BANCO: o total é o do conjunto
 * filtrado inteiro, não o da página. A situação é derivada (`situacaoDaOrdem`); para filtrar por ela no banco, a
 * descartada e o rascunho saem das relações, e a suspensa é a emitida cujo ÚLTIMO movimento é a suspensão — a mesma
 * régua, aplicada antes de paginar (senão a página viria curta e o total mentiria).
 */
export async function listarOrdensDeServicoDaSessao(
  tx: Tx,
  usuarioIdent: string,
  filtro: FiltroDasOrdens = {},
  agora: Date = new Date(),
): Promise<{ readonly ordens: readonly OrdemNaLista[]; readonly total: number; readonly pagina: number; readonly paginas: number; readonly todos: boolean }> {
  const alcance = await contratosNoAlcanceDasOrdens(tx, usuarioIdent, agora);
  if (!alcance.todos && alcance.ids.length === 0) return { ordens: [], total: 0, pagina: 1, paginas: 1, todos: false };
  const noAlcance = alcance.todos ? {} : { contratoId: { in: [...alcance.ids] } };

  const busca = (filtro.busca ?? "").trim();
  const numeroBuscado = /^(\d{1,6})(?:\/(\d{4}))?$/.exec(busca);
  const porBusca =
    busca === ""
      ? {}
      : {
          OR: [
            { finalidade: { contains: busca, mode: "insensitive" as const } },
            { contrato: { numeroContrato: { contains: busca, mode: "insensitive" as const } } },
            { contrato: { contratadoNome: { contains: busca, mode: "insensitive" as const } } },
            ...(numeroBuscado === null ? [] : [{ numero: Number(numeroBuscado[1]), ...(numeroBuscado[2] === undefined ? {} : { ano: Number(numeroBuscado[2]) }) }]),
          ],
        };
  const porAno = filtro.ano === undefined ? {} : { ano: filtro.ano };

  let porSituacao = {};
  if (filtro.situacao === "DESCARTADA") porSituacao = { descarte: { isNot: null } };
  else if (filtro.situacao === "RASCUNHO") porSituacao = { descarte: { is: null }, emissao: { is: null } };
  else if (filtro.situacao === "EMITIDA" || filtro.situacao === "SUSPENSA") {
    const emitidas = await tx.ordemDeServicoDoContrato.findMany({
      where: { ...noAlcance, descarte: { is: null }, emissao: { isNot: null }, movimentos: { some: {} } },
      select: { id: true, movimentos: { orderBy: [{ data: "desc" }, { criadoEm: "desc" }], take: 1, select: { tipo: true } } },
    });
    const suspensas = emitidas.filter((o) => o.movimentos[0]?.tipo === "SUSPENSAO").map((o) => o.id);
    porSituacao = {
      descarte: { is: null },
      emissao: { isNot: null },
      id: filtro.situacao === "SUSPENSA" ? { in: suspensas } : { notIn: suspensas },
    };
  }

  const where = { AND: [noAlcance, porBusca, porAno, porSituacao] };
  const total = await tx.ordemDeServicoDoContrato.count({ where });
  const paginas = Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.trunc(filtro.pagina ?? 1)), paginas);
  const os = await tx.ordemDeServicoDoContrato.findMany({
    where,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    skip: (pagina - 1) * ORDENS_POR_PAGINA,
    take: ORDENS_POR_PAGINA,
    select: {
      id: true, numero: true, ano: true, finalidade: true, inicioPrevisto: true, fimPrevisto: true,
      contrato: { select: { id: true, numeroContrato: true, contratadoNome: true } },
      emissao: { select: { data: true } },
      descarte: { select: { id: true } },
      movimentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { tipo: true } },
      empenho: { select: { numero: true } },
    },
  });
  return {
    total,
    pagina,
    paginas,
    todos: alcance.todos,
    ordens: os.map((o) => ({
      id: o.id,
      contratoId: o.contrato.id,
      contrato: o.contrato.numeroContrato,
      contratado: o.contrato.contratadoNome,
      numero: o.numero,
      ano: o.ano,
      finalidade: o.finalidade,
      situacao: situacaoDaOrdem(o),
      previsto: `${diaCivilBr(o.inicioPrevisto)} a ${diaCivilBr(o.fimPrevisto)}`,
      emitidaEm: o.emissao === null ? null : diaCivilBr(o.emissao.data),
      empenho: o.empenho?.numero ?? null,
    })),
  };
}
