import { cliente, PortaSemBancoError } from "./cliente";
import {
  listarTiposConsignacao,
  listarSaldosExtra,
  listarRetencoes,
  listarDispendios,
} from "../../modules/m07-extraorcamentario/consultas";

/**
 * PORTA — EXTRAORÇAMENTÁRIO (M07, TR 5.39–5.49). A tela consome ISTO (grep trivalente): o domínio
 * (modules/m07-extraorcamentario) nunca é importado por app/ direto. LEITURA: os saldos por
 * consignatário, as retenções (com drill ao pagamento/empenho, TR 5.25) e as despesas extra. O
 * cadastro/lançamento é do domínio (M07/M05) — esta fatia expõe a consulta.
 */

export { PortaSemBancoError };
export type {
  TipoConsignacaoNaLista,
  SaldoConsignatarioNaLista,
  RetencaoNaLista,
  DispendioNaLista,
} from "../../modules/m07-extraorcamentario/consultas";

export async function lerEventosExtra() {
  return listarTiposConsignacao(cliente());
}

export async function lerSaldosExtra() {
  return listarSaldosExtra(cliente());
}

export async function lerRetencoes(p: { readonly exercicio: number }) {
  return listarRetencoes(cliente(), { exercicio: p.exercicio });
}

export async function lerDispendiosExtra(p: { readonly exercicio: number }) {
  return listarDispendios(cliente(), { exercicio: p.exercicio });
}
