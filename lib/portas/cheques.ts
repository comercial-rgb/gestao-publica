import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";
import { temLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { diaCivil, fimDoDiaCivil, inicioDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import {
  cancelarChequeAvulso,
  chequesEmitidos,
  registrarChequeAvulso,
  totaisDosCheques,
  type OrigemDoCheque,
  type SituacaoDoCheque,
} from "../../modules/m09-tesouraria/cheques";

/**
 * V36 — A TELA DOS CHEQUES (TR 5.10.2.42): os de pagamento e os avulsos numa consulta só, o registro e o cancelamento
 * do avulso. A regra mora em `modules/m09-tesouraria/cheques.ts`; aqui só o recorte da URL e a sessão.
 *
 * A leitura é da tesouraria (a página exige CONSULTAR_FINANCEIRO no ente). O cheque de pagamento mostra credor e
 * empenho, que são dado da despesa: sem a consulta da despesa no ente, a lista traz só os avulsos e diz o motivo.
 */

export interface FiltroDosCheques {
  readonly de: string;
  readonly ate: string;
  readonly conta: string;
  readonly origem: OrigemDoCheque | "";
  readonly situacao: SituacaoDoCheque | "";
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ehOrigem = (v: string): v is OrigemDoCheque => v === "PAGAMENTO" || v === "AVULSO";
const ehSituacao = (v: string): v is SituacaoDoCheque => v === "EMITIDO" || v === "CANCELADO";

/** O filtro da URL; o padrão é o mês civil corrente até hoje. Período invertido vira erro dito, não lista vazia. */
export function filtroDosCheques(sp: Record<string, string | string[] | undefined>): FiltroDosCheques | { readonly erro: string } {
  const s = (k: string): string => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const hoje = diaCivil(new Date());
  const de = s("de") === "" ? `${hoje.slice(0, 8)}01` : s("de");
  const ate = s("ate") === "" ? hoje : s("ate");
  if (!DIA.test(de) || !DIA.test(ate)) return { erro: "Informe o período com datas válidas." };
  if (de > ate) return { erro: "A data inicial do período é posterior à final." };
  const origem = s("origem");
  const situacao = s("situacao");
  return { de, ate, conta: s("conta"), origem: ehOrigem(origem) ? origem : "", situacao: ehSituacao(situacao) ? situacao : "" };
}

export interface LinhaDoCheque {
  readonly id: string;
  readonly origem: OrigemDoCheque;
  readonly numero: string;
  readonly contaBancaria: string;
  readonly data: string;
  readonly valor: string;
  readonly favorecido: string;
  readonly finalidade: string;
  readonly situacao: SituacaoDoCheque;
  readonly canceladoEm: string | null;
  readonly motivoDoCancelamento: string | null;
  readonly empenhoId: string | null;
}

export interface TelaDosCheques {
  readonly linhas: readonly LinhaDoCheque[];
  readonly totais: { readonly emitido: string; readonly cancelado: string; readonly quantidade: number };
  readonly contas: readonly { readonly id: string; readonly codigo: string; readonly descricao: string }[];
  /** Não nulo quando os cheques de pagamento ficaram de fora por falta da consulta da despesa. */
  readonly motivoSemPagamentos: string | null;
}

export async function lerTelaDosCheques(f: FiltroDosCheques): Promise<TelaDosCheques> {
  const leDespesa = await temLeituraDoEnte("CONSULTAR_DESPESA");
  const [contas, linhas] = await Promise.all([
    cliente().contaBancaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    chequesEmitidos(cliente(), {
      de: inicioDoDiaCivil(f.de),
      ate: fimDoDiaCivil(f.ate),
      ...(f.conta !== "" ? { contaBancariaId: f.conta } : {}),
      ...(f.origem !== "" ? { origem: f.origem } : {}),
      ...(f.situacao !== "" ? { situacao: f.situacao } : {}),
      incluirDePagamento: leDespesa,
    }),
  ]);
  const nomes = await nomesDosCredores([...new Set(linhas.flatMap((l) => (l.credorCpfCnpj === null ? [] : [l.credorCpfCnpj])))]);
  const t = totaisDosCheques(linhas);
  const br = (d: Date): string => diaCivil(d).split("-").reverse().join("/");
  return {
    linhas: linhas.map((l) => ({
      id: l.id,
      origem: l.origem,
      numero: l.numero,
      contaBancaria: l.contaBancaria,
      data: br(l.data),
      valor: l.valor.toFixed(2),
      favorecido: l.credorCpfCnpj !== null ? (nomes.get(l.credorCpfCnpj) ?? l.favorecido) : l.favorecido,
      finalidade: l.finalidade,
      situacao: l.situacao,
      canceladoEm: l.canceladoEm === null ? null : br(l.canceladoEm),
      motivoDoCancelamento: l.motivoDoCancelamento,
      empenhoId: l.empenhoId,
    })),
    totais: { emitido: t.emitido.toFixed(2), cancelado: t.cancelado.toFixed(2), quantidade: t.quantidade },
    contas,
    motivoSemPagamentos: leDespesa
      ? null
      : "Os cheques emitidos em pagamentos não aparecem porque mostram credor e empenho, e o seu perfil não consulta a despesa de todo o ente. A lista traz só os cheques avulsos.",
  };
}

export async function registrarChequeAvulsoPelaTela(input: {
  readonly contaBancariaId: string;
  readonly numero: string;
  readonly dia: string;
  readonly valor: string;
  readonly favorecido: string;
  readonly finalidade: string;
}): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_MOVIMENTO_BANCARIO", async (criadoPor) =>
    (
      await registrarChequeAvulso(cliente(), {
        contaBancariaId: input.contaBancariaId,
        numero: input.numero,
        data: meioDiaCivil(input.dia),
        valor: input.valor,
        favorecido: input.favorecido,
        finalidade: input.finalidade,
        criadoPor,
      })
    ).chequeId
  );
}

export async function cancelarChequeAvulsoPelaTela(input: { readonly chequeId: string; readonly dia: string; readonly motivo: string }): Promise<void> {
  await comEscritaAutenticada("ESTORNAR_MOVIMENTO_BANCARIO", async (criadoPor) => {
    await cancelarChequeAvulso(cliente(), { chequeId: input.chequeId, data: meioDiaCivil(input.dia), motivo: input.motivo, criadoPor });
  });
}
