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

export const LIMITE_DA_LISTA_DE_ORDENS = 300;

/** As ordens no alcance, da mais recente para a mais antiga, até o limite (a tela diz quando ele é atingido). */
export async function listarOrdensDeServicoDaSessao(tx: Tx, usuarioIdent: string, agora: Date = new Date()): Promise<{ readonly ordens: readonly OrdemNaLista[]; readonly limitada: boolean; readonly todos: boolean }> {
  const alcance = await contratosNoAlcanceDasOrdens(tx, usuarioIdent, agora);
  if (!alcance.todos && alcance.ids.length === 0) return { ordens: [], limitada: false, todos: false };
  const os = await tx.ordemDeServicoDoContrato.findMany({
    where: alcance.todos ? {} : { contratoId: { in: [...alcance.ids] } },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: LIMITE_DA_LISTA_DE_ORDENS + 1,
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
    limitada: os.length > LIMITE_DA_LISTA_DE_ORDENS,
    todos: alcance.todos,
    ordens: os.slice(0, LIMITE_DA_LISTA_DE_ORDENS).map((o) => ({
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
