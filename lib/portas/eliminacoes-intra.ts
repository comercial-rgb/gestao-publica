import { cliente, PortaSemBancoError } from "./cliente";
import {
  eliminacoesIntragovernamentais,
  type EliminacoesIntragovernamentais,
  type ParDeEliminacao,
  type ContraparteDaDespesaIntra,
  type ContaNaEliminacao,
  type SituacaoDoPar,
} from "../../modules/m12-relatorios/eliminacoes-intra";

/**
 * PORTA — ELIMINAÇÕES INTRAGOVERNAMENTAIS NA CONSOLIDAÇÃO.
 *
 * LEITURA PURA. Nada se escreve: a eliminação é demonstrativo, e é assim que a visão individual de
 * cada unidade se preserva (ver o cabeçalho do módulo). Atrás do shell autenticado — é ferramenta
 * de CONFERÊNCIA do ente, como a consistência, e não demonstrativo publicado.
 */

export { PortaSemBancoError };
export type {
  EliminacoesIntragovernamentais,
  ParDeEliminacao,
  ContraparteDaDespesaIntra,
  ContaNaEliminacao,
  SituacaoDoPar,
};

export async function lerEliminacoesIntragovernamentais(p: {
  readonly exercicio: number;
  readonly bimestre: 1 | 2 | 3 | 4 | 5 | 6;
}): Promise<EliminacoesIntragovernamentais> {
  return eliminacoesIntragovernamentais(cliente(), p);
}
