import { cliente, PortaSemBancoError } from "./cliente";
import {
  diagnosticoPreEnvio,
  executarVerificacoes,
  type DiagnosticoPreEnvio,
  type EscopoConsistencia,
  type Verificacao,
} from "../../modules/m12-relatorios/consistencia";

/**
 * PORTA — RELATÓRIO DE CONSISTÊNCIA (TR 5.128–5.131 · 7.27). Leitura pura: o motor VISITA as
 * identidades dos donos e devolve a tríade. Atrás do shell autenticado — consistência é INTERNA
 * (ver a página); não vai para a lista pública da 7.15.
 */

export { PortaSemBancoError };
export type { Verificacao, DiagnosticoPreEnvio, EscopoConsistencia };

export async function gerarConsistencia(p: {
  readonly exercicio: number;
  readonly corte: Date;
  readonly escopo: EscopoConsistencia;
}): Promise<readonly Verificacao[]> {
  return executarVerificacoes(cliente(), p);
}

export async function gerarDiagnosticoPreEnvio(p: {
  readonly exercicio: number;
  readonly corte: Date;
}): Promise<DiagnosticoPreEnvio> {
  return diagnosticoPreEnvio(cliente(), p);
}
