import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraEmAlgumEscopo } from "./leitura";
import { listarQdd } from "../../modules/m03-creditos/consultas";
import { listarRealocacoes } from "../../modules/m03-creditos/consultas-realocacao";
import { criarRealocacaoDeps } from "../../modules/m03-creditos/adapter-realocacao";
import {
  anularRealocacao,
  registrarRealocacao,
  type EspecieDeRealocacao,
  type TipoPernaDeRealocacao,
} from "../../modules/m03-creditos/realocacao";

/**
 * A PORTA DA REALOCAÇÃO DE DOTAÇÃO (V21) — remanejamento, transposição e transferência por lei
 * específica (Constituição, art. 167, VI).
 *
 * A LEITURA cobra CONSULTAR_PLANEJAMENTO (a mesma do QDD, que é onde o efeito aparece). A ESCRITA
 * passa por `comEscritaAutenticada`, que exige sessão e injeta o autor real; a AUTORIZAÇÃO por ação
 * e por ficha é do caso de uso, no servidor — o botão escondido não protege nada.
 */

export { PortaSemBancoError };
export type { AtoDeRealocacaoNaLista, PernaNaLista } from "../../modules/m03-creditos/consultas-realocacao";
export type { EspecieDeRealocacao, TipoPernaDeRealocacao };

/** A ficha como o formulário a oferece: a chave curta, a fonte e o que ela pode ceder agora. */
export interface FichaParaRealocacao {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly programaCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly dotacaoAtualizada: string;
  /** Cache do M05 — ORIENTAÇÃO para escolher. Quem decide é o SUM dentro da transação. */
  readonly saldoDisponivel: string;
}

export async function lerRealocacoes(p: { readonly exercicio: number }) {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PLANEJAMENTO");
  return listarRealocacoes(cliente(), p);
}

export async function lerFichasParaRealocacao(p: {
  readonly exercicio: number;
}): Promise<readonly FichaParaRealocacao[]> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PLANEJAMENTO");
  const qdd = await listarQdd(cliente(), { exercicio: p.exercicio });
  return qdd.map((l) => ({
    id: l.fichaId,
    numero: l.numero,
    unidadeCodigo: l.unidadeCodigo,
    unidadeNome: l.unidadeNome,
    programaCodigo: l.programaCodigo,
    naturezaCodigo: l.naturezaCodigo,
    naturezaDescricao: l.naturezaDescricao,
    fonteId: l.fonteId,
    fonteCodigo: l.fonteCodigo,
    dotacaoAtualizada: l.dotacaoAtualizada,
    saldoDisponivel: l.saldoDisponivel,
  }));
}

export async function registrarAtoDeRealocacao(input: {
  readonly especie: EspecieDeRealocacao;
  readonly numero: string;
  readonly data: Date;
  readonly leiNumero: string;
  readonly leiDataPublicacao: Date;
  readonly justificativa: string;
  readonly pernas: readonly {
    readonly fichaId: string;
    readonly tipo: TipoPernaDeRealocacao;
    readonly valor: string;
    readonly fonteId: string;
  }[];
}): Promise<{ readonly atoId: string; readonly ano: number; readonly total: string }> {
  return comEscritaAutenticada("REGISTRAR_REALOCACAO_DE_DOTACAO", (criadoPor) =>
    registrarRealocacao({ ...input, pernas: [...input.pernas], criadoPor }, criarRealocacaoDeps(cliente()))
  );
}

export async function anularAtoDeRealocacao(input: {
  readonly atoId: string;
  readonly data: Date;
  readonly motivo: string;
}): Promise<{ readonly pernasEstornadas: number; readonly numero: string; readonly ano: number }> {
  return comEscritaAutenticada("ANULAR_REALOCACAO_DE_DOTACAO", (criadoPor) =>
    anularRealocacao({ ...input, criadoPor }, criarRealocacaoDeps(cliente()))
  );
}
