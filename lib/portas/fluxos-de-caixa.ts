import { cliente, PortaSemBancoError } from "./cliente";
import { contasDeDisponibilidade, RolDeDisponibilidadeAusenteError } from "./demonstrativos";
import { demonstracaoFluxosDeCaixa } from "../../modules/m12-relatorios/dfc";
import {
  DfcItemNaoClassificadoError,
  DfcNaoFechaError,
  type DemonstracaoFluxosDeCaixa,
} from "../../modules/m12-relatorios/dominio-dfc";

/**
 * PORTA — DEMONSTRAÇÃO DOS FLUXOS DE CAIXA (MCASP, Parte V).
 *
 * Borda só: zero aritmética, zero regra. O rol de contas de caixa é o MESMO do Balanço
 * Financeiro — `contasDeDisponibilidade()`, lido do cadastro de contas bancárias — e a
 * ausência dele é a MESMA recusa nomeada. Duas portas resolvendo o rol de dois jeitos dariam
 * duas demonstrações de caixa com caixas diferentes.
 *
 * As duas recusas do motor atravessam a borda com o nome delas, para a tela dizer qual foi:
 * - `DfcItemNaoClassificadoError`: um item sem atividade definida pelo código da natureza;
 * - `DfcNaoFechaError`: caixa inicial + geração líquida não bate com o caixa das partidas.
 */
export {
  DfcItemNaoClassificadoError,
  DfcNaoFechaError,
  PortaSemBancoError,
  RolDeDisponibilidadeAusenteError,
};

export async function gerarFluxosDeCaixa(p: {
  readonly exercicio: number;
}): Promise<DemonstracaoFluxosDeCaixa> {
  const rol = await contasDeDisponibilidade();
  if (rol.length === 0) throw new RolDeDisponibilidadeAusenteError();
  return demonstracaoFluxosDeCaixa(cliente(), p.exercicio, rol);
}

export type { DemonstracaoFluxosDeCaixa };
export type {
  AtividadeDfc,
  FluxoDaAtividade,
  LinhaDfc,
  NivelLinhaDfc,
} from "../../modules/m12-relatorios/dominio-dfc";
