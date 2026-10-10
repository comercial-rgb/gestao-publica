import { toMoney } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { alcanceNoContrato } from "./acesso-da-fiscalizacao.js";
import { valorAtualizadoDoContrato } from "./contratos.js";
import { controleContabilDoContrato } from "./controle-contabil-do-contrato.js";

/**
 * V39-R2 (R2-008 a 013) — O CONTROLE DO CONTRATO CONFERIDO CONTRA OS FATOS, E QUEM O LÊ.
 *
 * ⚠️ AFIRMA O EFEITO, NÃO A PAPELADA. O "a executar" que o controle registra (pelos lançamentos) é comparado com o que
 * os fatos do contrato dizem: o valor atualizado (inicial e aditivos) menos o liquidado líquido dos empenhos dele. Um
 * evento que aconteceu sem roteiro declarado (um acréscimo antes da decisão do contador, uma liquidação antes do
 * roteiro da execução) não lançou — e a divergência fica na tela enquanto existir, mesmo depois que o roteiro for
 * declarado. Só se confere contrato com o controle aberto (o REGISTRO lançado).
 *
 * ⚠️ QUEM LÊ: quem consulta licitações no ente, ou quem alcança a projeção financeira do contrato. A fiscalização
 * sozinha não vê o razão. A recusa diz o motivo.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type ControleNaTela = Awaited<ReturnType<typeof controleContabilDoContrato>> & {
  /** O que os fatos dizem que falta executar (nulo com o controle fechado). */
  readonly esperado: string | null;
  readonly diverge: boolean;
};

export async function conferenciaDoControleDoContrato(tx: Tx, contratoId: string): Promise<ControleNaTela> {
  const c = await controleContabilDoContrato(tx, contratoId);
  if (!c.controleAberto) return { ...c, esperado: null, diverge: false };
  const [atualizado, liquidacoes] = await Promise.all([
    valorAtualizadoDoContrato(tx, contratoId),
    tx.liquidacao.findMany({ where: { empenho: { contratoId } }, select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } }),
  ]);
  const liquidado = somaLiquidaEstornaveis(liquidacoes.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
  const esperado = toMoney(atualizado.minus(liquidado));
  return { ...c, esperado: esperado.toFixed(2), diverge: !esperado.equals(toMoney(c.aExecutar)) };
}

export type LeituraDoControle = { readonly negado: string } | { readonly controle: ControleNaTela; readonly podeDeclararRoteiro: boolean };

export async function controleDoContratoParaUsuario(tx: Tx, usuario: string, contratoId: string): Promise<LeituraDoControle> {
  const pode = async (acao: "CONSULTAR_LICITACOES" | "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO"): Promise<boolean> => {
    try {
      await autorizarNo(tx, usuario, acao, "ENTE");
      return true;
    } catch {
      return false;
    }
  };
  const leLicitacoes = await pode("CONSULTAR_LICITACOES");
  if (!leLicitacoes && !(await alcanceNoContrato(tx, usuario, contratoId)).financeira) {
    return { negado: "O controle contábil do contrato é lido por quem consulta licitações no ente ou alcança a execução financeira do contrato; a designação na fiscalização não basta." };
  }
  return { controle: await conferenciaDoControleDoContrato(tx, contratoId), podeDeclararRoteiro: await pode("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO") };
}
